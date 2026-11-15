// Reads Server-Sent Events (the "text/event-stream" format) that arrive in pieces of any size.
// A network read can stop in the middle of a line, so the parser keeps what it has until the line ends.
// Usage: const parser = createSSEParser(({ event, data }) => ...); parser.push(text) ... parser.end();
export function createSSEParser(onEvent) {
  let buffer = '';
  let eventName = 'message';
  let dataLines = [];

  const dispatch = () => {
    if (dataLines.length) onEvent({ event: eventName, data: dataLines.join('\n') });
    eventName = 'message';
    dataLines = [];
  };

  const handleLine = (line) => {
    if (line === '') return dispatch();
    if (line.startsWith(':')) return; // comment
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') eventName = value;
    else if (field === 'data') dataLines.push(value);
  };

  return {
    push(text) {
      buffer += text;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        let line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        handleLine(line);
        index = buffer.indexOf('\n');
      }
    },
    end() {
      if (buffer) {
        handleLine(buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer);
        buffer = '';
      }
      dispatch();
    },
  };
}
