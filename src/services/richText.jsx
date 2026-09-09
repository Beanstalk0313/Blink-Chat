// Shared rich-text rendering for chat messages (web + native).
//
// Supports: fenced code blocks, blockquotes, headings, lists, bold, italic,
// strikethrough, inline code, markdown links, bare URLs, and @user/@everyone/
// @role/#channel mentions (which win over inline formatting when overlapping).
// Everything is rendered as React elements - never dangerouslySetInnerHTML.

function isWordCharacter(character) {
  return Boolean(character && /[A-Za-z0-9_]/.test(character));
}

// Scans text and returns every @user / @everyone / @role / #channel mention as
// an absolute range, preferring the longest display name when names overlap.
// Kept in sync with the composer suggestion logic in ChatArea/native utils.
export function collectMentionRanges(text, members, channels, roles) {
  if (!text) return [];
  const lowerText = text.toLowerCase();
  const ranges = [];

  const addTriggerMatches = (trigger, candidates) => {
    const ordered = [...candidates].sort((first, second) => second.label.length - first.label.length);
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== trigger || isWordCharacter(text[index - 1])) continue;
      for (const candidate of ordered) {
        const name = candidate.label;
        if (lowerText.slice(index + 1, index + 1 + name.length) !== name) continue;
        if (isWordCharacter(text[index + 1 + name.length])) continue;
        ranges.push({ start: index, end: index + 1 + name.length, ...candidate });
        break;
      }
    }
  };

  addTriggerMatches('@', [
    ...members.filter(member => member?.displayName).map(member => ({ kind: 'user', label: member.displayName.trim().toLowerCase(), user: member })),
    { kind: 'everyone', label: 'everyone' },
    ...Object.values(roles || {}).filter(role => role?.name).map(role => ({ kind: 'role', label: role.name.trim().toLowerCase(), role }))
  ]);
  addTriggerMatches('#', channels
    .filter(channel => channel?.name && channel.type !== 'voice')
    .map(channel => ({ kind: 'channel', label: channel.name.trim().toLowerCase(), channel })));

  ranges.sort((first, second) => first.start - second.start || (second.end - first.end));
  const nonOverlapping = [];
  let cursor = -1;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    nonOverlapping.push(range);
    cursor = range.end;
  }
  return nonOverlapping;
}

// ---- Inline tokenization -------------------------------------------------

const INLINE_TOKEN_RE = /(`[^`\n]+`)|(\*\*\*[^*\n]+\*\*\*)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+)/g;

const TRAILING_URL_PUNCTUATION = /[.,;:!?'")\]]+$/;

function sanitizeUrl(url) {
  const trimmed = String(url || '').trim();
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return null;
}

function tokenizeInline(text) {
  const tokens = [];
  let match;
  INLINE_TOKEN_RE.lastIndex = 0;
  while ((match = INLINE_TOKEN_RE.exec(text)) !== null) {
    const full = match[0];
    const start = match.index;
    const end = start + full.length;
    if (full.startsWith('`')) {
      tokens.push({ type: 'code', text: full.slice(1, -1), start, end });
    } else if (full.startsWith('***')) {
      tokens.push({ type: 'bold-italic', text: full.slice(3, -3), start, end });
    } else if (full.startsWith('**')) {
      tokens.push({ type: 'bold', text: full.slice(2, -2), start, end });
    } else if (full.startsWith('~~')) {
      tokens.push({ type: 'strike', text: full.slice(2, -2), start, end });
    } else if (full.startsWith('*')) {
      tokens.push({ type: 'italic', text: full.slice(1, -1), start, end });
    } else if (full.startsWith('[')) {
      const labelEnd = full.indexOf('](');
      const label = full.slice(1, labelEnd);
      const url = full.slice(labelEnd + 2, -1);
      const safeUrl = sanitizeUrl(url);
      if (safeUrl) tokens.push({ type: 'link', label, href: safeUrl, start, end });
      // Unsafe links stay literal text.
    } else if (/^https?:/i.test(full)) {
      const trimmed = full.replace(TRAILING_URL_PUNCTUATION, '');
      tokens.push({ type: 'url', text: trimmed, start, end: start + trimmed.length });
      if (trimmed.length < full.length) {
        tokens.push({ type: 'text', text: full.slice(trimmed.length), start: start + trimmed.length, end });
      }
    }
  }
  return tokens;
}

// ---- Merging inline tokens with mention ranges ---------------------------

export function richSegments(text, { members, channels, roles }) {
  if (!text) return [];
  const ranges = collectMentionRanges(text, members, channels, roles);
  const tokens = tokenizeInline(text);
  const segments = [];
  let cursor = 0;
  let tokenIndex = 0;
  let rangeIndex = 0;

  const pushPlain = (from, to) => {
    if (to > from) segments.push({ type: 'text', text: text.slice(from, to) });
  };

  while (cursor < text.length) {
    const token = tokens[tokenIndex];
    const range = ranges[rangeIndex];
    const tokenStart = token ? token.start : Infinity;
    const rangeStart = range ? range.start : Infinity;
    if (tokenStart === Infinity && rangeStart === Infinity) {
      pushPlain(cursor, text.length);
      break;
    }
    if (rangeStart <= tokenStart) {
      pushPlain(cursor, rangeStart);
      segments.push({
        type: 'mention',
        kind: range.kind,
        user: range.user,
        role: range.role,
        channel: range.channel,
        label: text.slice(range.start, range.end)
      });
      cursor = range.end;
      rangeIndex += 1;
    } else {
      pushPlain(cursor, tokenStart);
      segments.push(token);
      cursor = token.end;
      tokenIndex += 1;
    }
  }
  return segments;
}

// ---- Block parsing -------------------------------------------------------

export function parseBlocks(text) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      const lang = fence[1] || '';
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1; // closing fence
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') });
      continue;
    }
    if (/^\s*$/.test(line)) {
      index += 1;
      continue;
    }
    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      const quoteLines = [quoteMatch[1]];
      index += 1;
      while (index < lines.length) {
        const nextQuote = lines[index].match(/^>\s?(.*)$/);
        if (!nextQuote) break;
        quoteLines.push(nextQuote[1]);
        index += 1;
      }
      blocks.push({ type: 'quote', lines: quoteLines });
      continue;
    }
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      index += 1;
      continue;
    }
    const listMatch = line.match(/^(?:[-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const ordered = /^\d+\./.test(line.trim());
      const items = [listMatch[1]];
      index += 1;
      while (index < lines.length) {
        const nextItem = lines[index].match(/^(?:[-*+]|\d+\.)\s+(.*)$/);
        if (!nextItem) break;
        items.push(nextItem[1]);
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    const paragraph = [line];
    index += 1;
    const breaksParagraph = next => /^\s*$/.test(next)
      || /^```/.test(next)
      || /^>\s?/.test(next)
      || /^#{1,3}\s+/.test(next)
      || /^(?:[-*+]|\d+\.)\s+/.test(next);
    while (index < lines.length && !breaksParagraph(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: 'text', lines: paragraph });
  }
  return blocks;
}

// ---- Rendering -----------------------------------------------------------

const noopClass = {
  userMention: '', channelMention: '', everyoneMention: '', roleMention: '',
  plainMention: '', link: '', inlineCode: '', codeBlock: '', codeBlockLang: '',
  quote: '', heading: '', list: '', paragraph: ''
};

export function renderRichText(text, options = {}) {
  if (!text) return null;
  const { plain = false, members = [], channels = [], roles = {}, classNames = {} } = options;
  const cn = { ...noopClass, ...classNames };
  const blocks = parseBlocks(text);

  const renderInline = (line, keyPrefix) => {
    const segments = richSegments(line, { members, channels, roles });
    return segments.map((segment, segmentIndex) => {
      const key = `${keyPrefix}:${segmentIndex}`;
      switch (segment.type) {
        case 'bold':
          return <strong key={key}>{segment.text}</strong>;
        case 'italic':
          return <em key={key}>{segment.text}</em>;
        case 'bold-italic':
          return <strong key={key}><em>{segment.text}</em></strong>;
        case 'strike':
          return <s key={key}>{segment.text}</s>;
        case 'code':
          return <code key={key} className={cn.inlineCode}>{segment.text}</code>;
        case 'url':
          return <a key={key} className={cn.link} href={segment.text} target="_blank" rel="noreferrer">{segment.text}</a>;
        case 'link':
          return <a key={key} className={cn.link} href={segment.href} target="_blank" rel="noreferrer">{segment.label}</a>;
        case 'mention':
          return renderMention(segment, key, cn, plain, options);
        default:
          return segment.text;
      }
    });
  };

  const renderMention = (segment, key, classes, isPlain, opts) => {
    const label = segment.label;
    if (segment.kind === 'user') {
      if (isPlain || !opts.onUserMention) {
        return <span key={key} className={classes.plainMention}>{label}</span>;
      }
      return (
        <button key={key} type="button" className={classes.userMention} title={`Open ${segment.user?.displayName || 'user'} profile`} onClick={() => opts.onUserMention(segment.user)}>
          {label}
        </button>
      );
    }
    if (segment.kind === 'channel') {
      const href = opts.channelHref ? opts.channelHref(segment.channel) : undefined;
      if (isPlain || !href) return <span key={key} className={classes.plainMention}>{label}</span>;
      return (
        <a
          key={key}
          href={href}
          className={classes.channelMention}
          onClick={opts.onChannelMention ? event => { event.preventDefault(); opts.onChannelMention(segment.channel); } : undefined}
        >
          {label}
        </a>
      );
    }
    if (segment.kind === 'role') {
      return <span key={key} className={classes.roleMention} style={segment.role?.color ? { color: segment.role.color } : undefined}>{label}</span>;
    }
    return <span key={key} className={classes.everyoneMention}>{label}</span>;
  };

  return blocks.map((block, blockIndex) => {
    const keyPrefix = `b${blockIndex}`;
    switch (block.type) {
      case 'code':
        return (
          <pre key={keyPrefix} className={cn.codeBlock}>
            {block.lang ? <span className={cn.codeBlockLang}>{block.lang}</span> : null}
            <code>{block.code}</code>
          </pre>
        );
      case 'quote': {
        const quoteNodes = [];
        block.lines.forEach((line, lineIndex) => {
          if (lineIndex > 0) quoteNodes.push(<br key={`${keyPrefix}:qbr${lineIndex}`} />);
          quoteNodes.push(...renderInline(line, `${keyPrefix}:q${lineIndex}`));
        });
        return <div key={keyPrefix} className={cn.quote}>{quoteNodes}</div>;
      }
      case 'heading':
        return <div key={keyPrefix} className={cn.heading} data-level={block.level}>{renderInline(block.text, `${keyPrefix}:h`)}</div>;
      case 'list': {
        const Tag = block.ordered ? 'ol' : 'ul';
        return (
          <Tag key={keyPrefix} className={cn.list}>
            {block.items.map((item, itemIndex) => (
              <li key={`${keyPrefix}:i${itemIndex}`}>{renderInline(item, `${keyPrefix}:i${itemIndex}`)}</li>
            ))}
          </Tag>
        );
      }
      default: {
        const nodes = [];
        block.lines.forEach((line, lineIndex) => {
          if (lineIndex > 0) nodes.push(<br key={`${keyPrefix}:br${lineIndex}`} />);
          nodes.push(...renderInline(line, `${keyPrefix}:l${lineIndex}`));
        });
        return <div key={keyPrefix} className={cn.paragraph}>{nodes}</div>;
      }
    }
  });
}