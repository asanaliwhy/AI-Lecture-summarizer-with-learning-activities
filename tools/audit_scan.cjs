const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const EXCLUDE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.vite',
  '.next',
  'coverage',
])

const CODE_EXTS = new Set(['.ts', '.tsx', '.go', '.sql', '.js', '.jsx', '.toml', '.yml', '.yaml'])

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else {
      const ext = path.extname(entry.name)
      if (CODE_EXTS.has(ext) || entry.name.startsWith('.env')) out.push(full)
    }
  }
  return out
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/')
}

function addIssue(issues, severity, file, line, issue, fix) {
  issues.push({ severity, file: rel(file), line, issue, fix })
}

function scanFile(file, issues) {
  let text = ''
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return
  }
  const lines = text.split(/\r?\n/)
  const ext = path.extname(file)
  const r = rel(file)

  // Generic scans
  lines.forEach((line, idx) => {
    const n = idx + 1

    if (/\bas\s+any\b/.test(line) || /:\s*any\b/.test(line) || /<any>/.test(line)) {
      addIssue(
        issues,
        'Medium',
        file,
        n,
        'Type safety bypass with any type.',
        'Replace any with explicit interfaces, discriminated unions, or unknown + narrowing.',
      )
    }

    if (/@ts-ignore/.test(line)) {
      addIssue(
        issues,
        'Medium',
        file,
        n,
        'TypeScript error suppression via @ts-ignore.',
        'Fix root type mismatch and remove suppression comment.',
      )
    }

    if (/dangerouslySetInnerHTML/.test(line)) {
      addIssue(
        issues,
        'High',
        file,
        n,
        'dangerouslySetInnerHTML is used; XSS risk if sanitization assumptions break.',
        'Ensure strict sanitization with vetted allowlist and centralize safe HTML rendering wrapper.',
      )
    }

    if (/TODO|FIXME/.test(line)) {
      addIssue(
        issues,
        'Low',
        file,
        n,
        'Unresolved TODO/FIXME marker.',
        'Track with issue ID and resolve or remove stale note.',
      )
    }

    if (/localStorage\.(setItem|getItem)\(['\"][^'\"]*token/i.test(line)) {
      addIssue(
        issues,
        'High',
        file,
        n,
        'Token is stored/read from localStorage (XSS exfiltration risk).',
        'Move access token to in-memory storage and refresh token to httpOnly secure cookie.',
      )
    }

    if (/console\.(log|error|warn|info)\(/.test(line)) {
      addIssue(
        issues,
        'Low',
        file,
        n,
        'Console logging left in production code path.',
        'Replace with structured logger and redact sensitive values.',
      )
    }

    if (/panic\s*\(/.test(line)) {
      addIssue(
        issues,
        'High',
        file,
        n,
        'panic call can crash process if not recovered.',
        'Return errors and handle centrally with recovery middleware.',
      )
    }

    if (/setFillColor\(|doc\.text\(['\"]Lectura · Page 1['\"]/.test(line)) {
      // No-op marker scan for PDF manual review hint
    }
  })

  // File-level frontend scans
  if (ext === '.tsx' || ext === '.ts') {
    if (/useEffect\s*\(/.test(text)) {
      const regex = /useEffect\s*\(([^)]|\n)*?\)\s*[,)]/g
      let m
      while ((m = regex.exec(text)) !== null) {
        const chunk = m[0]
        const line = text.slice(0, m.index).split(/\r?\n/).length
        if (!/\],?\s*\)?$/.test(chunk) && !/,\s*\[[^\]]*\]/s.test(chunk)) {
          addIssue(
            issues,
            'Medium',
            file,
            line,
            'useEffect without explicit dependency array can cause repeated reruns.',
            'Add correct dependency array or convert to event-driven logic.',
          )
        }
      }
    }

    const loc = lines.length
    if (r.startsWith('src/pages/') && loc > 300) {
      addIssue(
        issues,
        'Medium',
        file,
        1,
        `Large page component (${loc} LOC) increases maintenance risk.`,
        'Split into smaller presentational components and move logic to hooks/services.',
      )
    }
  }

  // Backend scans
  if (ext === '.go') {
    if (/AllowOrigins|allowedOrigins|CORS|cors/.test(text) && /\*/.test(text)) {
      addIssue(
        issues,
        'High',
        file,
        1,
        'CORS appears to allow wildcard origins.',
        'Restrict origins per environment and enforce strict allowlist in production.',
      )
    }

    if (/fmt\.Sprintf\s*\([^\n]*(SELECT|INSERT|UPDATE|DELETE)/.test(text)) {
      const idx = lines.findIndex((l) => /fmt\.Sprintf\s*\([^\n]*(SELECT|INSERT|UPDATE|DELETE)/.test(l))
      addIssue(
        issues,
        'High',
        file,
        Math.max(1, idx + 1),
        'SQL statement built with fmt.Sprintf may permit SQL injection if untrusted values are interpolated.',
        'Use parameterized placeholders with db.Query/Exec arguments.',
      )
    }

    if (/Query\([^\n]*\+/.test(text) || /Exec\([^\n]*\+/.test(text)) {
      const idx = lines.findIndex((l) => /Query\([^\n]*\+/.test(l) || /Exec\([^\n]*\+/.test(l))
      addIssue(
        issues,
        'High',
        file,
        Math.max(1, idx + 1),
        'Database call appears to concatenate query text.',
        'Use static SQL with placeholders and bound parameters.',
      )
    }

    if (/GEMINI_API_KEY\s*=\s*"[^"]+"/.test(text) || /AIza[0-9A-Za-z\-_]{20,}/.test(text)) {
      addIssue(
        issues,
        'Critical',
        file,
        1,
        'Potential hardcoded API key detected.',
        'Remove key from code/history, rotate secret, and load from validated environment variable.',
      )
    }
  }

  // env leaks
  if (path.basename(file).startsWith('.env')) {
    lines.forEach((line, idx) => {
      const n = idx + 1
      if (/API_KEY=|SECRET=|TOKEN=|PASSWORD=/i.test(line) && !/=\s*$/.test(line) && !/example/i.test(r)) {
        addIssue(
          issues,
          'Critical',
          file,
          n,
          'Sensitive value appears committed in env file.',
          'Remove secrets from repository, rotate credentials, and keep only placeholders in tracked env templates.',
        )
      }
    })
  }
}

function scanFunctionLengths(file, issues) {
  if (path.extname(file) !== '.go') return
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (/^func\s+\(.*\)\s+[A-Za-z0-9_]+\s*\(/.test(lines[i]) || /^func\s+[A-Za-z0-9_]+\s*\(/.test(lines[i])) {
      let depth = 0
      let started = false
      let j = i
      for (; j < lines.length; j++) {
        const l = lines[j]
        for (const ch of l) {
          if (ch === '{') {
            depth++
            started = true
          } else if (ch === '}') {
            depth--
          }
        }
        if (started && depth <= 0) break
      }
      const span = j - i + 1
      if (span > 100 && /internal\/handlers\//.test(rel(file))) {
        addIssue(
          issues,
          'Medium',
          file,
          i + 1,
          `Handler/function is long (${span} LOC), likely mixing concerns.`,
          'Extract validation, business rules, and response mapping into services/helpers.',
        )
      }
      i = j
    }
  }
}

function main() {
  const files = walk(ROOT)
  const issues = []
  for (const f of files) {
    scanFile(f, issues)
    scanFunctionLengths(f, issues)
  }

  // deterministic order
  const sevOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 }
  issues.sort((a, b) => {
    const s = sevOrder[a.severity] - sevOrder[b.severity]
    if (s !== 0) return s
    if (a.file !== b.file) return a.file.localeCompare(b.file)
    return a.line - b.line
  })

  fs.writeFileSync(path.join(ROOT, 'audit_findings.json'), JSON.stringify(issues, null, 2), 'utf8')

  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 }
  for (const i of issues) counts[i.severity] += 1

  fs.writeFileSync(
    path.join(ROOT, 'audit_counts.json'),
    JSON.stringify({ counts, total: issues.length }, null, 2),
    'utf8',
  )

  console.log(`scanned_files=${files.length}`)
  console.log(`total_issues=${issues.length}`)
  console.log(JSON.stringify(counts))
}

main()

