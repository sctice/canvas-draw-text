function drawText(ctx, txt, x, y, opts = {}) {
  if (opts.width < 1) {
    throw new RangeError('Missing or invalid width');
  }

  if (opts.lineHeight < 1) {
    throw new RangeError('Missing or invalid lineHeight');
  }


  const parseTree = parseText(txt);
  const nodes = flattenParseTree(parseTree);
  drawToLines(ctx, nodes, x, y, opts);
}

function parseText(txt) {
  const tagRe = /<\/?([^>]+)>/g;
  let pos = 0;
  let contextStack = [{type: 'root', children: []}];
  let match;
  while ((match = tagRe.exec(txt)) !== null) {
    const isCloseTag = match[0].charAt(1) === '/';
    const tagName = match[1];
    const slice = txt.slice(pos, match.index)
    if (slice) {
      last(contextStack).children.push({type: 'text', text: slice});
    }
    if (!isCloseTag) {
      const newNode = {type: 'node', name: tagName, children: []};
      last(contextStack).children.push(newNode);
      contextStack.push(newNode);
    } else {
      if (contextStack.pop().name !== tagName) {
        throw new Error('Mismatched tags in text');
      }
    }
    pos = tagRe.lastIndex;
  }
  if (contextStack.length !== 1) {
    throw new Error('Unclosed tag in text');
  }
  if (pos < txt.length) {
    last(contextStack).children.push({type: 'text', text: txt.substr(pos)});
  }
  return last(contextStack);
}

function flattenParseTree(tree) {
  const seq = [];
  const contextStack = [];
  const toVisit = [tree];
  while (toVisit.length > 0) {
    let node = toVisit.pop();
    if (node.type === 'text') {
      seq.push({context: Array.from(contextStack), text: node.text});
    } else if (node.type === 'pop') {
      contextStack.pop();
    } else {
      toVisit.push({type: 'pop'});
      if (node.name) {
        contextStack.push(node.name);
      }
      for (let i = node.children.length - 1; i >= 0; i--) {
        toVisit.push(node.children[i]);
      }
    }
  }
  return seq;
}

function drawToLines(ctx, nodes, xBase, yBase, opts) {
  const rules = opts.rules || {};
  let x = xBase;
  let y = yBase;

  nodes.forEach((node) => {
    let nodeRules = combineRenderRules(node.context, rules);
    withRenderRules(ctx, nodeRules, () => {
      let beg = 0;
      let end = 0;

      function renderText(txt, width) {
        ctx.fillText(txt, x, y);
        x += width;
      }

      function renderNewLine() {
        y += opts.lineHeight;
        x = xBase;
      }

      while (beg < node.text.length) {
        let width = 0;
        let newEnd = expandSlice(node.text, end);
        let newWidth = ctx.measureText(node.text.slice(beg, newEnd)).width;
        while (end < node.text.length && x + newWidth <= opts.width) {
          [end, width] = [newEnd, newWidth];
          newEnd = expandSlice(node.text, end);
          newWidth = ctx.measureText(node.text.slice(beg, newEnd)).width;
        }
        if (beg === end) {
          if (x === xBase) {
            renderText(node.text.slice(beg, newEnd), newWidth)
            end = newEnd;
          }
          renderNewLine();
          // Skip whitespace that would render at the end of this line / the
          // beginning of the next line. Whitespace can get you to the end of
          // the line, but it won't continue through to the next line.
          beg = expandSlice(node.text, end, /\S/)
        } else {
          renderText(node.text.slice(beg, end), width);
          beg = end;
        }
      }
    });
  });
}

function expandSlice(txt, pos, re) {
  if (re === undefined) {
    if (/[\s-]/.test(txt.charAt(pos))) {
      return Math.min(pos + 1, txt.length);
    }
    re = /[\s-]/;
  }
  const m = re.exec(txt.substr(pos));
  if (m === null) {
    return txt.length;
  }
  return pos + m.index;
}

function combineRenderRules(tags, rules) {
  const base = rules._base || {};
  return Object.assign.apply(Object, [{}, base].concat(tags.map((tag) =>
    rules[tag] || {})));
}

function withRenderRules(ctx, rules, cb) {
  ctx.save();
  let [font, otherRules] = buildFont(rules);
  if (font) {
    ctx._setFont(font.weight, font.style, font.size, 'px', font.family);
  }
  Object.entries(otherRules).forEach(([prop, value]) => {
    ctx[prop] = value;
  });
  cb();
  ctx.restore();
}

function buildFont(rules) {
  let font = false;
  const fontRules = {};
  const otherRules = {};
  Object.entries(rules).forEach(([prop, value]) => {
    if (prop.startsWith('font')) {
      fontRules[prop] = value;
      font = true;
    } else {
      otherRules[prop] = value;
    }
  });
  if (font) {
    font = {
      style: fontRules.fontStyle || 'normal',
      weight: fontRules.fontWeight || '400',
      size: fontRules.fontSize || 10,
      family: fontRules.fontFamily || 'sans-serif'
    }
  }
  return [font, otherRules];
}

function last(arr) {
  return arr[arr.length - 1];
}

module.exports = drawText;
