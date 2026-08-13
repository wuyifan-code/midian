export interface SseEvent {
  event: string;
  data: string;
}

export interface SseFeed {
  feed: (chunk: string) => void;
  finish: () => void;
}

export function createSseParser(onEvent: (ev: SseEvent) => void): SseFeed {
  let buffer = '';
  let eventName = '';
  const dataLines: string[] = [];

  const dispatch = () => {
    const data = dataLines.join('\n');
    if (data.length > 0) {
      onEvent({ event: eventName || 'message', data });
    }
    eventName = '';
    dataLines.length = 0;
  };

  const processLine = (rawLine: string) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '') {
      dispatch();
      return;
    }
    if (line.startsWith(':')) {
      return;
    }
    const sep = line.indexOf(':');
    if (sep === -1) {
      return;
    }
    const field = line.slice(0, sep);
    let value = line.slice(sep + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }
    if (field === 'event') {
      eventName = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
  };

  const feed = (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      processLine(line);
    }
  };

  const finish = () => {
    if (buffer.length > 0) {
      const lines = buffer.split('\n');
      for (const line of lines) {
        processLine(line);
      }
      buffer = '';
    }
    dispatch();
  };

  return { feed, finish };
}
