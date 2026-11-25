// 送り直し待ちの列。電波がないときの保存を端末にためておき、戻ったら古い順に送る。
export function createOutbox(kv) {
  let running = null;

  async function list() {
    return (await kv.getAll('outbox')).sort((a, b) => a.seq - b.seq);
  }

  async function enqueue(op) {
    const seq = ((await kv.get('kv', 'outboxSeq')) ?? 0) + 1;
    await kv.put('kv', 'outboxSeq', seq);
    const full = { ...op, seq, opId: `op-${seq}`, createdAt: Date.now() };
    await kv.put('outbox', full.opId, full);
    return full;
  }

  async function processOnce(api, cache) {
    const idMap = (await kv.get('kv', 'idMap')) ?? {};
    let sent = 0;
    const touched = new Set();
    for (const op of await list()) {
      const eventId = idMap[op.eventId] ?? op.eventId;
      try {
        if (op.type === 'insert') {
          const made = await api.insertEvent({ calendarId: op.calendarId, resource: op.resource });
          idMap[op.tempId] = made.id;
          await kv.put('kv', 'idMap', idMap);
          const temp = await cache.get(op.calendarId, op.tempId);
          if (temp) { await cache.remove(op.calendarId, op.tempId); await cache.upsert({ ...temp, id: made.id }); }
          touched.add(`${op.calendarId}|${made.id}`);
        } else if (op.type === 'patch') {
          await api.patchEvent({ calendarId: op.calendarId, eventId, resource: op.resource });
          touched.add(`${op.calendarId}|${eventId}`);
        } else if (op.type === 'delete') {
          await api.deleteEvent({ calendarId: op.calendarId, eventId });
          await cache.remove(op.calendarId, eventId);
        } else if (op.type === 'saveSettings') {
          await api.saveSettings(op.settings);
        }
        await kv.delete('outbox', op.opId);
        sent++;
      } catch (e) {
        if (e?.kind === 'notFound' && (op.type === 'patch' || op.type === 'delete')) {
          await kv.delete('outbox', op.opId);
          continue;
        }
        // 電波・合言葉・Google 側の不調などは、順番を守るためにそこで止めて残す
        break;
      }
    }
    // 送り終わった予定から「まだ保存中」の印を外す（同じ予定の依頼が残っていれば外さない）
    const rest = await list();
    const stillPending = new Set(rest.map(o => `${o.calendarId}|${idMap[o.eventId ?? o.tempId] ?? o.eventId ?? o.tempId}`));
    for (const key of touched) {
      if (stillPending.has(key)) continue;
      const [calendarId, id] = key.split('|');
      const ev = await cache.get(calendarId, id);
      if (ev?.pending) await cache.upsert({ ...ev, pending: false });
    }
    return { sent, remaining: rest.length };
  }

  // 同時に 2 回動かない
  function process(api, cache) {
    if (!running) running = processOnce(api, cache).finally(() => { running = null; });
    return running;
  }

  return { enqueue, list, process };
}
