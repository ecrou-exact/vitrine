import { describe, expect, it } from 'vitest';
import { imageRef, parseDockerfile, splitInstructions, words } from '../../src/components/dockerfile/dockerfile.js'; // prettier-ignore
import { VtDockerfile } from '../../src/components/dockerfile/vt-dockerfile.js';

const FILE = `# syntax=docker/dockerfile:1
ARG NODE_VERSION=20
FROM node:\${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:latest AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ubuntu AS tools
RUN apt-get update && apt-get install curl \\
    # a comment inside
    git
RUN curl -fsSL https://get.example.sh | sh
ENV API_TOKEN=abc123

FROM nginx:1.27-alpine
MAINTAINER ops@example.com
ADD nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=missing /x /y
RUN cd /etc && chmod 777 nginx
EXPOSE 80 22
CMD nginx -g "daemon off;"
`;

const ids = (findings) => findings.map((f) => f.id);

describe('parseDockerfile', () => {
  it('reads instructions with continuations, flags and heredocs', () => {
    const { instructions } = splitInstructions('RUN apt-get update && \\\n  # note\n  apt-get install -y curl\nCOPY --chown=app:app --from=build /a /b\nRUN <<EOF\necho hi\nEOF\nCMD ["node", "server.js"]'); // prettier-ignore
    expect(instructions.map((i) => [i.keyword, i.line, i.lines])).toEqual([['RUN', 1, 3], ['COPY', 4, 1], ['RUN', 5, 3], ['CMD', 8, 1]]); // prettier-ignore
    expect(instructions[0].args).toBe('apt-get update &&    apt-get install -y curl');
    expect(instructions[1].flags).toEqual(['--chown=app:app', '--from=build']);
    expect(instructions[2].heredocs).toEqual(['echo hi']);
    expect(instructions[3].json).toBe(true);
    expect(words('["a", "b c"]')).toEqual(['a', 'b c']);
    expect(imageRef('ghcr.io/org/app:1.2@sha256:' + 'a'.repeat(64))).toMatchObject({ name: 'ghcr.io/org/app', tag: '1.2' }); // prettier-ignore
    expect(imageRef('localhost:5000/app').tag).toBe('');
  });

  it('reads the stages', () => {
    const d = parseDockerfile(FILE);
    expect(d.args).toEqual(['NODE_VERSION']);
    expect(d.stages.map((s) => [s.name, s.image, s.from, s.final])).toEqual([
      ['deps', 'node:${NODE_VERSION}-alpine', [], false],
      ['build', 'node:latest', ['deps'], false],
      ['tools', 'ubuntu', [], false],
      ['', 'nginx:1.27-alpine', ['build', 'missing'], true],
    ]);
    expect(d.stages[3].ports).toEqual(['80', '22']);
  });

  it('flags what reviewers flag', () => {
    const found = ids(parseDockerfile(FILE).findings);
    for (const id of [
      'variableImage',
      'npmCi',
      'latest',
      'untagged',
      'aptRecommends',
      'aptLists',
      'aptYes',
      'unusedStage',
      'pipeShell',
      'secret',
      'maintainer',
      'addCopy',
      'unknownStage',
      'cd',
      'chmod777',
      'ssh',
      'shellForm',
      'noUser',
      'noHealthcheck',
    ])
      // prettier-ignore
      expect(found).toContain(id);
  });

  it('passes a careful Dockerfile', () => {
    const good = `FROM python:3.12-slim@sha256:${'b'.repeat(64)} AS base
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
USER 10001
HEALTHCHECK CMD ["python", "-c", "print(1)"]
ENTRYPOINT ["tini", "--"]
CMD ["python", "app.py"]`;
    expect(parseDockerfile(good).findings).toEqual([]);
    expect(parseDockerfile('FROM a:1\nUSER root\nCMD ["x"]').findings.map((f) => f.id)).toContain('rootUser'); // prettier-ignore
    expect(ids(parseDockerfile('RUN echo\nFROM a:1').findings)).toContain('beforeFrom');
    expect(ids(parseDockerfile('FROM a:1\nBOGUS x').findings)).toContain('unknown');
  });
});

describe('<vt-dockerfile>', () => {
  if (!customElements.get('vt-dockerfile')) customElements.define('vt-dockerfile', VtDockerfile);

  it('shows stages, instructions and their problems', () => {
    const el = /** @type {VtDockerfile} */ (document.createElement('vt-dockerfile'));
    el.setAttribute('variant', 'full');
    el.setAttribute('lang-ui', 'en');
    el.content = FILE;
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelectorAll('.docker-stage')).toHaveLength(4);
    expect(root.querySelector('.docker-stage.final .docker-chip.final')?.textContent).toBe('final image'); // prettier-ignore
    const add = root.querySelector('[data-line="23"]');
    expect(add?.querySelector('[data-finding="addCopy"]')).not.toBeNull();
    expect(root.querySelector('[data-line="3"] .d-kw')?.textContent).toBe('FROM');
    /** @type {HTMLButtonElement} */ (root.querySelector('[data-tab="source"]')).click();
    expect(el.root.querySelector('.docker-source')?.textContent).toContain('MAINTAINER ops@example.com'); // prettier-ignore
    /** @type {HTMLElement | null} */ (document.activeElement)?.blur();
    el.remove();
  });
});
