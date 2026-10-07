// Hostile content, always set through the `content` property (never inline HTML).
const xss = `
# Hostile document

<script>window.__xss = 1</script>
<img src=x onerror="window.__xss = 2">
<a href="javascript:window.__xss=3">js link</a> [md js link](javascript:window.__xss=4)
<iframe src="https://example.com"></iframe>
<svg onload="window.__xss = 5"><circle r="5" /></svg>
<div style="background:url(https://evil.example/x)">styled</div>
<form action="https://evil.example"><input name="pw" type="password"></form>
[data link](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)
![svg data](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)
<details open ontoggle="window.__xss = 6"><summary>details</summary>body</details>
`;
for (const id of ['hostile', 'hostile-html']) {
  const el = document.getElementById(id);
  if (el && el.localName === 'vt-markdown') el.content = xss;
}
const json = document.getElementById('hostile');
if (json && json.localName === 'vt-json') {
  json.content = JSON.stringify({
    html: '<img src=x onerror="window.__xss = 7">',
    script: '</script><script>window.__xss = 8</script>',
    long: 'x'.repeat(5000),
    big: Array.from({ length: 250 }, (_, i) => i),
  });
}
