---
title: Front matter is hidden
---

# mkserve showcase

A sample workspace covering every rendering feature. Run
`node dist/cli.mjs test/fixtures/showcase` and edit this file to try hot
reload.

## CommonMark

Paragraphs with **bold**, _italic_, `inline code`, and a [link to the
guide](docs/guide.md#usage). External links such as
[CommonMark](https://commonmark.org) open in a new tab.

> A plain blockquote.

1. Ordered
2. List

- Unordered
  - Nested

---

![Logo](docs/images/logo.svg)

## GitHub Flavored Markdown

| Feature  | Supported |
| -------- | :-------: |
| Tables   |    ✅     |
| Tasks    |    ✅     |
| ~~Strike~~ |  ✅     |

- [x] Done task
- [ ] Open task

Autolink: https://example.com and a footnote.[^1]

[^1]: The footnote text.

## Math

Inline math $E = mc^2$ and a display block:

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

## Mermaid

```mermaid
flowchart LR
  A[Save file] --> B{Watcher}
  B -->|SSE| C[Browser]
  C --> D[Re-render]
```

## Code

```ts
interface Greeting {
  name: string;
}

export function greet({name}: Greeting): string {
  return `Hello, ${name}!`;
}
```

```bash
pnpm add -g @shunya-sasaki/mkserve
mkserve --port 4000
```

```unknown-language
Falls back to plain text.
```

## Alerts

> [!NOTE]
> Useful information.

> [!TIP]
> Helpful advice.

> [!IMPORTANT]
> Key information.

> [!WARNING]
> Urgent info that needs attention.

> [!CAUTION]
> Risks or negative outcomes.

## Raw HTML

<details>
<summary>Click to expand</summary>

Hidden content.

</details>
