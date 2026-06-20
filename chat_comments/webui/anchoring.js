// Pure DOM/string helpers for anchoring comments to selected text.
// No imports — operates on DOM nodes and strings only.

// Nearest ancestor that is a rendered chat message: <div id="message-<id>">.
export function getMessageContainer(node) {
  let el = node && node.nodeType === 3 ? node.parentElement : node;
  while (el && el !== document.body) {
    if (el.id && el.id.startsWith("message-")) return el;
    el = el.parentElement;
  }
  return null;
}

// Character offset of a range's start within the container's text content.
export function rangeStartOffset(container, range) {
  const pre = document.createRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

// How many non-overlapping appearances of `quoted` start strictly before `startOffset`.
// That count IS the 0-based occurrence index of the appearance at startOffset.
export function occurrenceForStart(text, quoted, startOffset) {
  if (!quoted) return 0;
  let from = 0;
  let count = 0;
  while (true) {
    const idx = text.indexOf(quoted, from);
    if (idx === -1 || idx >= startOffset) break;
    count++;
    from = idx + quoted.length;
  }
  return count;
}

// Offsets {start,end} of the `occurrence`-th (0-based) non-overlapping appearance, or null.
export function findOccurrenceOffsets(text, quoted, occurrence) {
  if (!quoted) return null;
  let from = 0;
  for (let i = 0; i <= occurrence; i++) {
    const idx = text.indexOf(quoted, from);
    if (idx === -1) return null;
    if (i === occurrence) return { start: idx, end: idx + quoted.length };
    from = idx + quoted.length;
  }
  return null;
}

// Wrap [start,end) of the container's text in <mark class=className data-comment-id=id>.
// Splits across text nodes safely (each sub-range is within one text node).
export function wrapOffsets(container, start, end, commentId, className) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let node;
  const targets = [];
  while ((node = walker.nextNode())) {
    const len = node.nodeValue.length;
    const nodeStart = pos;
    const nodeEnd = pos + len;
    if (nodeEnd > start && nodeStart < end) {
      targets.push({
        node,
        s: Math.max(0, start - nodeStart),
        e: Math.min(len, end - nodeStart),
      });
    }
    pos = nodeEnd;
    if (pos >= end) break;
  }
  // Wrap last-to-first so earlier offsets stay valid.
  for (let i = targets.length - 1; i >= 0; i--) {
    const { node, s, e } = targets[i];
    const r = document.createRange();
    r.setStart(node, s);
    r.setEnd(node, e);
    const mark = document.createElement("mark");
    mark.className = className;
    mark.dataset.commentId = commentId;
    r.surroundContents(mark);
  }
}

// Remove all highlight <mark>s under root, restoring their text.
export function clearHighlights(root, className) {
  root.querySelectorAll("." + className).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

// Does `range` overlap any existing highlight inside `container`?
export function rangeIntersectsHighlights(range, container, className) {
  const marks = container.querySelectorAll("." + className);
  for (const m of marks) {
    if (range.intersectsNode(m)) return true;
  }
  return false;
}
