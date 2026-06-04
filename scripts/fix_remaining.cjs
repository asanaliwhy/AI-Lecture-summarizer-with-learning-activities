const fs = require('fs');
const filePath = 'src/components/presentation/SlideRenderer.tsx';
let content = fs.readFileSync(filePath, 'utf8');
let changes = 0;

function r(label, old, replacement) {
  const lines = old.split('\n').map(l => l.replace(/\r$/, ''));
  const search = lines.join('\r\n');
  if (content.includes(search)) {
    content = content.replace(search, replacement.split('\n').map(l => l.replace(/\r$/, '')).join('\r\n'));
    console.log(`✅ ${label}`);
    changes++;
  } else {
    console.log(`❌ ${label} - NOT FOUND`);
  }
}

// ================================================================
// 1. COMPARISON TABLE - title + subtitle (lines ~1204-1220)
// ================================================================
r('Comparison table title',
`                <h2
                  style={{
                    margin: 0,
                    fontFamily: theme.displayFont,
                    fontSize: fs(56),
                    lineHeight: 1.05,
                    letterSpacing: '-0.026em',
                    fontWeight: 700,
                  }}
                >
                  {slide.title}
                </h2>
                {slide.subtitle && (
                  <p style={{ marginTop: s(10), color: theme.subtext, fontSize: fs(19), lineHeight: 1.42 }}>
                    {slide.subtitle}
                  </p>
                )}`,
`                <EditableText
                  tag="h2"
                  value={slide.title || ''}
                  editable={canEdit}
                  onChange={(v) => updateField('title', v)}
                  style={{
                    margin: 0,
                    fontFamily: theme.displayFont,
                    fontSize: fs(56),
                    lineHeight: 1.05,
                    letterSpacing: '-0.026em',
                    fontWeight: 700,
                  }}
                />
                {slide.subtitle && (
                  <EditableText tag="p" value={String(slide.subtitle)} editable={canEdit} onChange={(v) => updateField('subtitle', v)} style={{ marginTop: s(10), color: theme.subtext, fontSize: fs(19), lineHeight: 1.42 }} />
                )}`);

// ================================================================
// 2. COMPARISON TABLE - header cells + body cells
// ================================================================
r('Comparison table headers',
`                    >
                      {header}
                    </th>`,
`                    >
                      <EditableText tag="span" value={header} editable={canEdit} onChange={() => {}} />
                    </th>`);

r('Comparison table cells',
`                    >
                      {cell}
                    </td>`,
`                    >
                      <EditableText tag="span" value={cell} editable={canEdit} onChange={() => {}} />
                    </td>`);

// ================================================================
// 3. TIMELINE - title + subtitle (the variant with fs(56))
// ================================================================
r('Timeline title',
`              <h2
                style={{
                  margin: 0,
                  fontFamily: theme.displayFont,
                  fontSize: fs(56),
                  lineHeight: 1.04,
                  letterSpacing: '-0.03em',
                  fontWeight: 700,
                }}
              >
                {slide.title}
              </h2>
              {slide.subtitle && (
                <p
                  style={{
                    marginTop: s(12),
                    color: theme.subtext,
                    fontSize: fs(19),
                    lineHeight: 1.4,
                  }}
                >
                  {slide.subtitle}
                </p>
              )}

              <div
                style={{
                  marginTop: slide.subtitle ? s(62) : s(82),`,
`              <EditableText
                tag="h2"
                value={slide.title || ''}
                editable={canEdit}
                onChange={(v) => updateField('title', v)}
                style={{
                  margin: 0,
                  fontFamily: theme.displayFont,
                  fontSize: fs(56),
                  lineHeight: 1.04,
                  letterSpacing: '-0.03em',
                  fontWeight: 700,
                }}
              />
              {slide.subtitle && (
                <EditableText
                  tag="p"
                  value={String(slide.subtitle)}
                  editable={canEdit}
                  onChange={(v) => updateField('subtitle', v)}
                  style={{
                    marginTop: s(12),
                    color: theme.subtext,
                    fontSize: fs(19),
                    lineHeight: 1.4,
                  }}
                />
              )}

              <div
                style={{
                  marginTop: slide.subtitle ? s(62) : s(82),`);

// ================================================================
// 4. TIMELINE items - left side title + description
// ================================================================
r('Timeline left title',
`                            <div style={{ minWidth: 0, textAlign: 'right' }}>
                              <div
                                style={{
                                  fontFamily: theme.displayFont,
                                  fontSize: fs(25),
                                  lineHeight: 1.12,
                                  letterSpacing: '-0.02em',
                                  fontWeight: 650,
                                  color: theme.text,
                                }}
                              >
                                {item.title}
                              </div>
                              <p
                                style={{
                                  margin: \`\${s(8)}px 0 0\`,
                                  fontSize: fs(17),
                                  lineHeight: 1.38,
                                  color: theme.subtext,
                                }}
                              >
                                {item.description}
                              </p>`,
`                            <div style={{ minWidth: 0, textAlign: 'right' }}>
                              <EditableText
                                value={item.title}
                                editable={canEdit}
                                onChange={(v) => updateBullet(index, \`TIMELINE:\${item.number}||\${v}||\${item.description}\`)}
                                style={{
                                  fontFamily: theme.displayFont,
                                  fontSize: fs(25),
                                  lineHeight: 1.12,
                                  letterSpacing: '-0.02em',
                                  fontWeight: 650,
                                  color: theme.text,
                                }}
                              />
                              <EditableText
                                tag="p"
                                value={item.description}
                                editable={canEdit}
                                onChange={(v) => updateBullet(index, \`TIMELINE:\${item.number}||\${item.title}||\${v}\`)}
                                style={{
                                  margin: \`\${s(8)}px 0 0\`,
                                  fontSize: fs(17),
                                  lineHeight: 1.38,
                                  color: theme.subtext,
                                }}
                              />`);

// ================================================================
// 5. TIMELINE items - right side title + description
// ================================================================
r('Timeline right title',
`                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontFamily: theme.displayFont,
                                  fontSize: fs(25),
                                  lineHeight: 1.12,
                                  letterSpacing: '-0.02em',
                                  fontWeight: 650,
                                  color: theme.text,
                                }}
                              >
                                {item.title}
                              </div>
                              <p
                                style={{
                                  margin: \`\${s(8)}px 0 0\`,
                                  fontSize: fs(17),
                                  lineHeight: 1.38,
                                  color: theme.subtext,
                                }}
                              >
                                {item.description}
                              </p>`,
`                            <div style={{ minWidth: 0 }}>
                              <EditableText
                                value={item.title}
                                editable={canEdit}
                                onChange={(v) => updateBullet(index, \`TIMELINE:\${item.number}||\${v}||\${item.description}\`)}
                                style={{
                                  fontFamily: theme.displayFont,
                                  fontSize: fs(25),
                                  lineHeight: 1.12,
                                  letterSpacing: '-0.02em',
                                  fontWeight: 650,
                                  color: theme.text,
                                }}
                              />
                              <EditableText
                                tag="p"
                                value={item.description}
                                editable={canEdit}
                                onChange={(v) => updateBullet(index, \`TIMELINE:\${item.number}||\${item.title}||\${v}\`)}
                                style={{
                                  margin: \`\${s(8)}px 0 0\`,
                                  fontSize: fs(17),
                                  lineHeight: 1.38,
                                  color: theme.subtext,
                                }}
                              />`);

// ================================================================
// 6. FLOW ARROWS - title + subtitle
// ================================================================
r('Flow arrows title',
`              <h2
                style={{
                  margin: 0,
                  fontFamily: theme.displayFont,
                  fontSize: fs(56),
                  lineHeight: 1.04,
                  letterSpacing: '-0.03em',
                  fontWeight: 700,
                }}
              >
                {slide.title}
              </h2>
              {slide.subtitle && (
                <p
                  style={{
                    marginTop: s(12),
                    color: theme.subtext,
                    fontSize: fs(19),
                    lineHeight: 1.4,
                  }}
                >
                  {slide.subtitle}
                </p>
              )}

              <div
                style={{
                  marginTop: flowStartOffset,`,
`              <EditableText
                tag="h2"
                value={slide.title || ''}
                editable={canEdit}
                onChange={(v) => updateField('title', v)}
                style={{
                  margin: 0,
                  fontFamily: theme.displayFont,
                  fontSize: fs(56),
                  lineHeight: 1.04,
                  letterSpacing: '-0.03em',
                  fontWeight: 700,
                }}
              />
              {slide.subtitle && (
                <EditableText
                  tag="p"
                  value={String(slide.subtitle)}
                  editable={canEdit}
                  onChange={(v) => updateField('subtitle', v)}
                  style={{
                    marginTop: s(12),
                    color: theme.subtext,
                    fontSize: fs(19),
                    lineHeight: 1.4,
                  }}
                />
              )}

              <div
                style={{
                  marginTop: flowStartOffset,`);

// ================================================================
// 7. FLOW ARROWS - item title + description
// ================================================================
r('Flow arrows item title',
`                      <div
                        style={{
                          fontFamily: theme.displayFont,
                          fontSize: fs(40),
                          lineHeight: 1.12,
                          letterSpacing: '-0.018em',
                          fontWeight: 650,
                          color: theme.text,
                        }}
                      >
                        {item.title}
                      </div>
                      <p
                        style={{
                          margin: \`\${s(10)}px 0 0\`,
                          color: theme.subtext,
                          fontSize: fs(18),
                          lineHeight: 1.45,
                        }}
                      >
                        {item.description}
                      </p>`,
`                      <EditableText
                        value={item.title}
                        editable={canEdit}
                        onChange={(v) => updateBullet(index, \`FLOW:\${item.number}||\${v}||\${item.description}\`)}
                        style={{
                          fontFamily: theme.displayFont,
                          fontSize: fs(40),
                          lineHeight: 1.12,
                          letterSpacing: '-0.018em',
                          fontWeight: 650,
                          color: theme.text,
                        }}
                      />
                      <EditableText
                        tag="p"
                        value={item.description}
                        editable={canEdit}
                        onChange={(v) => updateBullet(index, \`FLOW:\${item.number}||\${item.title}||\${v}\`)}
                        style={{
                          margin: \`\${s(10)}px 0 0\`,
                          color: theme.subtext,
                          fontSize: fs(18),
                          lineHeight: 1.45,
                        }}
                      />`);

// ================================================================
// 8. FEATURE TRIO - title + subtitle
// ================================================================
r('Feature trio title',
`                <h2
                  style={{
                    margin: 0,
                    fontFamily: theme.displayFont,
                    fontSize: fs(56),
                    lineHeight: 1.05,
                    letterSpacing: '-0.03em',
                    fontWeight: 700,
                  }}
                >
                  {slide.title}
                </h2>
                {slide.subtitle && (
                  <p style={{ marginTop: s(12), color: theme.subtext, fontSize: fs(18), lineHeight: 1.4 }}>
                    {slide.subtitle}
                  </p>
                )}`,
`                <EditableText
                  tag="h2"
                  value={slide.title || ''}
                  editable={canEdit}
                  onChange={(v) => updateField('title', v)}
                  style={{
                    margin: 0,
                    fontFamily: theme.displayFont,
                    fontSize: fs(56),
                    lineHeight: 1.05,
                    letterSpacing: '-0.03em',
                    fontWeight: 700,
                  }}
                />
                {slide.subtitle && (
                  <EditableText tag="p" value={String(slide.subtitle)} editable={canEdit} onChange={(v) => updateField('subtitle', v)} style={{ marginTop: s(12), color: theme.subtext, fontSize: fs(18), lineHeight: 1.4 }} />
                )}`);

// ================================================================
// 9. FEATURE TRIO - item title + description
// ================================================================
r('Feature trio item title',
`                    <div
                      style={{
                        fontFamily: theme.displayFont,
                        fontSize: fs(36),
                        lineHeight: 1.15,
                        letterSpacing: '-0.018em',
                        fontWeight: 650,
                        textAlign: 'center',
                      }}
                    >
                      {item.title}
                    </div>
                    <p
                      style={{
                        margin: \`\${s(8)}px 0 0\`,
                        color: theme.subtext,
                        fontSize: fs(18),
                        lineHeight: 1.5,
                        textAlign: 'center',
                      }}
                    >
                      {item.description}
                    </p>`,
`                    <EditableText
                      value={item.title}
                      editable={canEdit}
                      onChange={(v) => updateBullet(index, \`FEATURE:\${item.icon}||\${v}||\${item.description}\`)}
                      style={{
                        fontFamily: theme.displayFont,
                        fontSize: fs(36),
                        lineHeight: 1.15,
                        letterSpacing: '-0.018em',
                        fontWeight: 650,
                        textAlign: 'center',
                      }}
                    />
                    <EditableText
                      tag="p"
                      value={item.description}
                      editable={canEdit}
                      onChange={(v) => updateBullet(index, \`FEATURE:\${item.icon}||\${item.title}||\${v}\`)}
                      style={{
                        margin: \`\${s(8)}px 0 0\`,
                        color: theme.subtext,
                        fontSize: fs(18),
                        lineHeight: 1.5,
                        textAlign: 'center',
                      }}
                    />`);

// ================================================================
// 10. NUMBERED BULLETS - title + description
// ================================================================
r('Numbered bullet title',
`                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: theme.displayFont,
                            fontSize: fs(numTitleSize),
                            fontWeight: 600,
                            lineHeight: 1.22,
                            color: theme.text,
                          }}
                        >
                          {item.title}
                        </div>
                        <div
                          style={{
                            marginTop: s(5),
                            fontSize: fs(numDescSize),
                            fontWeight: 400,
                            lineHeight: ultraDenseContent ? 1.35 : 1.4,
                            color: theme.subtext,
                          }}
                        >
                          {item.description}
                        </div>`,
`                      <div style={{ minWidth: 0 }}>
                        <EditableText
                          value={item.title}
                          editable={canEdit}
                          onChange={(v) => updateBullet(index, \`NUM:\${item.number}||\${v}||\${item.description}\`)}
                          style={{
                            fontFamily: theme.displayFont,
                            fontSize: fs(numTitleSize),
                            fontWeight: 600,
                            lineHeight: 1.22,
                            color: theme.text,
                          }}
                        />
                        <EditableText
                          value={item.description}
                          editable={canEdit}
                          onChange={(v) => updateBullet(index, \`NUM:\${item.number}||\${item.title}||\${v}\`)}
                          style={{
                            marginTop: s(5),
                            fontSize: fs(numDescSize),
                            fontWeight: 400,
                            lineHeight: ultraDenseContent ? 1.35 : 1.4,
                            color: theme.subtext,
                          }}
                        />`);

// ================================================================
// 11. CARD GRID - label + description
// ================================================================
r('Card grid label',
`                        <div
                          style={{
                            fontFamily: theme.displayFont,
                            fontSize: fs(cardTitleSize),
                            fontWeight: 600,
                            lineHeight: 1.15,
                            letterSpacing: '-0.015em',
                            color: theme.text,
                          }}
                        >
                          {card.label}
                        </div>
                        <div
                          style={{
                            marginTop: s(6),
                            fontSize: fs(cardDescSize),
                            fontWeight: 400,
                            lineHeight: ultraDenseContent ? 1.4 : 1.5,
                            color: theme.subtext,
                          }}
                        >
                          {card.description}
                        </div>`,
`                        <EditableText
                          value={card.label}
                          editable={canEdit}
                          onChange={(v) => updateBullet(index, \`CARD:\${v}||\${card.description}\`)}
                          style={{
                            fontFamily: theme.displayFont,
                            fontSize: fs(cardTitleSize),
                            fontWeight: 600,
                            lineHeight: 1.15,
                            letterSpacing: '-0.015em',
                            color: theme.text,
                          }}
                        />
                        <EditableText
                          value={card.description}
                          editable={canEdit}
                          onChange={(v) => updateBullet(index, \`CARD:\${card.label}||\${v}\`)}
                          style={{
                            marginTop: s(6),
                            fontSize: fs(cardDescSize),
                            fontWeight: 400,
                            lineHeight: ultraDenseContent ? 1.4 : 1.5,
                            color: theme.subtext,
                          }}
                        />`);

// ================================================================
// 12. PROSE - paragraph text
// ================================================================
r('Prose paragraphs',
`                  <p
                    key={index}
                    style={{
                      margin: 0,
                      color: theme.text,
                      fontSize: fs(17),
                      lineHeight: 1.5,
                      fontWeight: 400,
                    }}
                  >
                    {paragraph}
                  </p>`,
`                  <EditableText
                    key={index}
                    tag="p"
                    value={paragraph}
                    editable={canEdit}
                    onChange={(v) => updateField('body', v)}
                    style={{
                      margin: 0,
                      color: theme.text,
                      fontSize: fs(17),
                      lineHeight: 1.5,
                      fontWeight: 400,
                    }}
                  />`);

// ================================================================
// 13. TWO COLUMN - overline labels (textOverline renders col.label)
// ================================================================
// The textOverline function is used for column labels. We need to check
// if it's customizable. For now, let's make column items editable.

fs.writeFileSync(filePath, content, 'utf8');
console.log(`\nTotal: ${changes} replacements applied`);
