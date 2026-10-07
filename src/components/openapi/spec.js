// @ts-check
/**
 * Reads an OpenAPI 3.x (or Swagger 2.0) document into a model that is simple to display:
 * operations grouped by tag, parameters merged from the path and the operation, request
 * bodies and responses by media type, and helpers to resolve `$ref`, describe schemas and
 * build example values.
 *
 * Only local references (`#/components/...`, `#/definitions/...`) are followed: external
 * files are never fetched. Every walk is bounded in depth and guarded against cycles.
 *
 * @module components/openapi/spec
 */

/** @typedef {Record<string, any>} Json */

/**
 * @typedef {object} Parameter
 * @property {string} name
 * @property {string} in - `path`, `query`, `header` or `cookie`.
 * @property {boolean} required
 * @property {boolean} deprecated
 * @property {string} description
 * @property {Json | null} schema
 * @property {unknown} example
 */

/**
 * @typedef {object} Media
 * @property {string} type - Media type, e.g. `application/json`.
 * @property {Json | null} schema
 * @property {unknown} example - Explicit example, or `undefined`.
 */

/**
 * @typedef {object} Response
 * @property {string} status - `200`, `4XX`, `default`…
 * @property {string} description
 * @property {Media[]} content
 */

/**
 * @typedef {object} Operation
 * @property {string} key - Unique key (`get /users/{id}`).
 * @property {string} method - Upper case.
 * @property {string} path
 * @property {string} operationId
 * @property {string} summary
 * @property {string} description
 * @property {string[]} tags
 * @property {boolean} deprecated
 * @property {Parameter[]} parameters
 * @property {{ description: string, required: boolean, content: Media[] } | null} requestBody
 * @property {Response[]} responses
 * @property {string[]} security - Names of the security schemes that apply.
 */

/**
 * @typedef {object} ApiModel
 * @property {Json} root - The document, for `$ref` resolution.
 * @property {string} version - `3.1.0`, `2.0`…
 * @property {string} title
 * @property {string} apiVersion
 * @property {string} description
 * @property {{ url: string, description: string }[]} servers
 * @property {{ name: string, description: string }[]} tags
 * @property {Operation[]} operations
 * @property {{ name: string, type: string, description: string }[]} securitySchemes
 * @property {boolean} truncated - More than {@link MAX_OPERATIONS} operations.
 */

export const METHODS = /** @type {const} */ ([
  'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace',
]); // prettier-ignore

/** Operations kept at most. */
export const MAX_OPERATIONS = 2000;
/** Deepest schema walked. */
export const MAX_DEPTH = 12;

/** Thrown when the document is not OpenAPI. */
export class SpecError extends Error {}

/**
 * @param {unknown} value
 * @returns {value is Json}
 */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function text(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * Follows a local JSON pointer (`#/components/schemas/User`).
 *
 * @param {Json} root
 * @param {string} ref
 * @returns {unknown}
 */
export function pointer(root, ref) {
  if (!ref.startsWith('#')) return undefined;
  /** @type {any} */
  let current = root;
  for (const raw of ref.slice(1).split('/').slice(1)) {
    const key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
    if (
      !current ||
      typeof current !== 'object' ||
      !Object.prototype.hasOwnProperty.call(current, key)
    )
      return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Resolves `$ref` chains (at most 20 hops). Unknown references resolve to `null`.
 *
 * @param {Json} root
 * @param {unknown} value
 * @returns {Json | null}
 */
export function resolve(root, value) {
  let current = value;
  for (
    let hops = 0;
    hops < 20 && isObject(current) && typeof current.$ref === 'string';
    hops += 1
  ) {
    current = pointer(root, current.$ref);
  }
  return isObject(current) && typeof current.$ref !== 'string' ? current : null;
}

/**
 * Name of the component a `$ref` points to (`User` for `#/components/schemas/User`).
 *
 * @param {unknown} value
 * @returns {string}
 */
export function refName(value) {
  return isObject(value) && typeof value.$ref === 'string'
    ? decodeURIComponent(value.$ref.split('/').pop() ?? '')
    : '';
}

/**
 * Reads media types (`content` in 3.x).
 *
 * @param {Json} root
 * @param {unknown} content
 * @returns {Media[]}
 */
function mediaList(root, content) {
  if (!isObject(content)) return [];
  return Object.entries(content)
    .slice(0, 20)
    .map(([type, raw]) => {
      const media = resolve(root, raw) ?? {};
      const examples = isObject(media.examples) ? Object.values(media.examples) : [];
      const firstExample = examples.length ? resolve(root, examples[0])?.value : undefined;
      return {
        type,
        schema: media.schema ?? null,
        example: media.example !== undefined ? media.example : firstExample,
      };
    });
}

/**
 * Reads an OpenAPI or Swagger document (already parsed from JSON or YAML).
 *
 * @param {unknown} document
 * @returns {ApiModel}
 * @throws {SpecError}
 */
export function readSpec(document) {
  if (!isObject(document)) throw new SpecError('The document is not an object.');
  const swagger = text(document.swagger).startsWith('2');
  const version = text(document.openapi) || text(document.swagger);
  if (!version) throw new SpecError('Missing "openapi" (or "swagger") version field.');
  if (!swagger && !/^3\./.test(version))
    throw new SpecError(`Unsupported OpenAPI version ${version}.`);
  const info = isObject(document.info) ? document.info : {};

  /** @type {{ url: string, description: string }[]} */
  let servers = [];
  if (swagger) {
    const host = text(document.host);
    if (host) {
      const scheme =
        Array.isArray(document.schemes) && document.schemes.includes('https')
          ? 'https'
          : (document.schemes?.[0] ?? 'https');
      servers = [{ url: `${scheme}://${host}${text(document.basePath)}`, description: '' }];
    }
  } else if (Array.isArray(document.servers)) {
    servers = document.servers
      .filter(isObject)
      .slice(0, 20)
      .map((server) => ({ url: serverUrl(server), description: text(server.description) }));
  }

  /** @type {Operation[]} */
  const operations = [];
  let truncated = false;
  const paths = isObject(document.paths) ? document.paths : {};
  for (const [path, rawItem] of Object.entries(paths)) {
    const item = resolve(document, rawItem);
    if (!item) continue;
    const shared = Array.isArray(item.parameters) ? item.parameters : [];
    for (const method of METHODS) {
      const op = item[method];
      if (!isObject(op)) continue;
      if (operations.length >= MAX_OPERATIONS) {
        truncated = true;
        break;
      }
      operations.push(readOperation(document, path, method, op, shared, swagger));
    }
  }

  const declaredTags = Array.isArray(document.tags)
    ? document.tags
        .filter(isObject)
        .map((tag) => ({ name: text(tag.name), description: text(tag.description) }))
    : [];
  // Tags used by operations but not declared come after the declared ones, in order of use.
  const used = new Set(operations.flatMap((op) => op.tags));
  const tags = [
    ...declaredTags.filter((tag) => used.has(tag.name)),
    ...[...used]
      .filter((name) => !declaredTags.some((tag) => tag.name === name))
      .map((name) => ({ name, description: '' })),
  ];

  const schemes = swagger ? document.securityDefinitions : document.components?.securitySchemes;
  const securitySchemes = isObject(schemes)
    ? Object.entries(schemes).map(([name, raw]) => {
        const scheme = resolve(document, raw) ?? {};
        const kind = text(scheme.type);
        const detail =
          kind === 'http'
            ? `HTTP ${text(scheme.scheme)}${scheme.bearerFormat ? ` (${text(scheme.bearerFormat)})` : ''}`
            : kind === 'apiKey'
              ? `API key in ${text(scheme.in)} "${text(scheme.name)}"`
              : kind === 'oauth2'
                ? 'OAuth 2.0'
                : kind === 'openIdConnect'
                  ? 'OpenID Connect'
                  : kind;
        return { name, type: detail, description: text(scheme.description) };
      })
    : [];

  return {
    root: document,
    version,
    title: text(info.title) || 'API',
    apiVersion: text(info.version),
    description: text(info.description),
    servers,
    tags,
    operations,
    securitySchemes,
    truncated,
  };
}

/**
 * Server URL with its variables replaced by their defaults.
 *
 * @param {Json} server
 * @returns {string}
 */
function serverUrl(server) {
  const variables = isObject(server.variables) ? server.variables : {};
  return text(server.url).replace(/\{([^}]+)\}/g, (match, name) => {
    const variable = variables[name];
    return isObject(variable) && variable.default !== undefined ? String(variable.default) : match;
  });
}

/**
 * @param {Json} root
 * @param {string} path
 * @param {string} method
 * @param {Json} op
 * @param {unknown[]} shared - Path-level parameters.
 * @param {boolean} swagger
 * @returns {Operation}
 */
function readOperation(root, path, method, op, shared, swagger) {
  /** @type {Map<string, Parameter>} */
  const parameters = new Map();
  /** @type {Json | null} */
  let bodyParameter = null;
  /** @type {Json[]} */
  const formParameters = [];
  for (const raw of [...shared, ...(Array.isArray(op.parameters) ? op.parameters : [])]) {
    const param = resolve(root, raw);
    if (!param) continue;
    if (swagger && param.in === 'body') {
      bodyParameter = param;
      continue;
    }
    if (swagger && param.in === 'formData') {
      formParameters.push(param);
      continue;
    }
    const schema =
      param.schema ??
      (swagger
        ? {
            type: param.type,
            format: param.format,
            enum: param.enum,
            items: param.items,
            default: param.default,
          }
        : null);
    // Operation parameters override path parameters with the same name and location.
    parameters.set(`${param.in}:${param.name}`, {
      name: text(param.name),
      in: text(param.in),
      required: param.in === 'path' || Boolean(param.required),
      deprecated: Boolean(param.deprecated),
      description: text(param.description),
      schema,
      example:
        param.example ??
        (isObject(param.examples)
          ? resolve(root, Object.values(param.examples)[0])?.value
          : undefined),
    });
  }

  /** @type {Operation["requestBody"]} */
  let requestBody = null;
  if (!swagger && op.requestBody) {
    const body = resolve(root, op.requestBody) ?? {};
    requestBody = {
      description: text(body.description),
      required: Boolean(body.required),
      content: mediaList(root, body.content),
    };
  } else if (bodyParameter) {
    const consumes = Array.isArray(op.consumes)
      ? op.consumes
      : Array.isArray(root.consumes)
        ? root.consumes
        : ['application/json'];
    requestBody = {
      description: text(bodyParameter.description),
      required: Boolean(bodyParameter.required),
      content: consumes.slice(0, 5).map((type) => ({
        type: String(type),
        schema: bodyParameter?.schema ?? null,
        example: undefined,
      })),
    };
  } else if (formParameters.length) {
    const properties = Object.fromEntries(
      formParameters.map((p) => [
        text(p.name),
        { type: p.type, format: p.format, description: p.description },
      ]),
    );
    requestBody = {
      description: '',
      required: formParameters.some((p) => p.required),
      content: [
        {
          type: 'application/x-www-form-urlencoded',
          schema: {
            type: 'object',
            properties,
            required: formParameters.filter((p) => p.required).map((p) => p.name),
          },
          example: undefined,
        },
      ],
    };
  }

  /** @type {Response[]} */
  const responses = [];
  if (isObject(op.responses)) {
    const produces = Array.isArray(op.produces)
      ? op.produces
      : Array.isArray(root.produces)
        ? root.produces
        : ['application/json'];
    for (const [status, raw] of Object.entries(op.responses).slice(0, 40)) {
      const response = resolve(root, raw) ?? {};
      const content = swagger
        ? response.schema
          ? produces.slice(0, 3).map((type) => ({
              type: String(type),
              schema: response.schema,
              example: response.examples?.[type],
            }))
          : []
        : mediaList(root, response.content);
      responses.push({ status, description: text(response.description), content });
    }
  }

  const security = Array.isArray(op.security)
    ? op.security
    : Array.isArray(root.security)
      ? root.security
      : [];
  return {
    key: `${method} ${path}`,
    method: method.toUpperCase(),
    path,
    operationId: text(op.operationId),
    summary: text(op.summary),
    description: text(op.description),
    tags: Array.isArray(op.tags) && op.tags.length ? op.tags.map(String) : ['default'],
    deprecated: Boolean(op.deprecated),
    parameters: [...parameters.values()],
    requestBody,
    responses,
    security: [...new Set(security.filter(isObject).flatMap((entry) => Object.keys(entry)))],
  };
}

/**
 * Merges the schemas of `allOf` into one object schema (one level, references resolved).
 *
 * @param {Json} root
 * @param {Json} schema
 * @returns {Json}
 */
export function mergeAllOf(root, schema) {
  if (!Array.isArray(schema.allOf)) return schema;
  /** @type {Json} */
  const merged = {
    ...schema,
    allOf: undefined,
    properties: { ...(schema.properties ?? {}) },
    required: [...(schema.required ?? [])],
  };
  for (const part of schema.allOf.slice(0, 20)) {
    const resolved = resolve(root, part);
    if (!resolved) continue;
    const flat = mergeAllOf(root, resolved);
    Object.assign(merged.properties, flat.properties ?? {});
    merged.required.push(...(flat.required ?? []));
    if (!merged.type && flat.type) merged.type = flat.type;
    if (!merged.description && flat.description) merged.description = flat.description;
  }
  return merged;
}

/**
 * Short type label of a schema: `string (date-time)`, `integer`, `array of User`,
 * `User`, `"a" | "b"`, `one of: Cat, Dog`.
 *
 * @param {Json} root
 * @param {unknown} raw
 * @returns {string}
 */
export function typeLabel(root, raw) {
  const name = refName(raw);
  const schema = resolve(root, raw);
  if (!schema) return name || 'any';
  if (name) return name;
  if (Array.isArray(schema.enum) && schema.enum.length <= 6 && schema.enum.length)
    return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  for (const key of ['oneOf', 'anyOf']) {
    if (Array.isArray(schema[key]))
      return `${key === 'oneOf' ? 'one of' : 'any of'}: ${schema[key]
        .slice(0, 6)
        .map((/** @type {unknown} */ s) => typeLabel(root, s))
        .join(', ')}`;
  }
  const types = Array.isArray(schema.type)
    ? schema.type.filter((t) => t !== 'null')
    : [schema.type];
  const nullable =
    schema.nullable === true || (Array.isArray(schema.type) && schema.type.includes('null'));
  let label = types.filter(Boolean).join(' | ');
  if (types.includes('array') || (!label && schema.items))
    label = `array of ${typeLabel(root, schema.items)}`;
  else if (!label) label = schema.properties || schema.allOf ? 'object' : 'any';
  if (schema.format) label += ` (${schema.format})`;
  return nullable ? `${label} | null` : label;
}

/**
 * Builds an example value for a schema: its `example`, `examples`, `default` or first
 * `enum` value, or a typical value for its type and format.
 *
 * @param {Json} root
 * @param {unknown} raw
 * @param {number} [depth]
 * @param {Set<unknown>} [seen] - Schemas being expanded (cycle guard).
 * @returns {unknown}
 */
export function exampleFor(root, raw, depth = 0, seen = new Set()) {
  const schema = resolve(root, raw);
  if (!schema || depth > 8 || seen.has(schema)) return null;
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const next = new Set(seen).add(schema);
  if (Array.isArray(schema.allOf)) return exampleFor(root, mergeAllOf(root, schema), depth, seen);
  for (const key of ['oneOf', 'anyOf']) {
    if (Array.isArray(schema[key]) && schema[key].length)
      return exampleFor(root, schema[key][0], depth + 1, next);
  }
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
  if (type === 'array' || schema.items) {
    const item = exampleFor(root, schema.items, depth + 1, next);
    return item === null ? [] : [item];
  }
  if (type === 'object' || schema.properties) {
    /** @type {Json} */
    const object = {};
    for (const [key, value] of Object.entries(schema.properties ?? {}).slice(0, 40)) {
      object[key] = exampleFor(root, value, depth + 1, next);
    }
    return object;
  }
  switch (type) {
    case 'integer':
      return schema.minimum ?? 0;
    case 'number':
      return schema.minimum ?? 0;
    case 'boolean':
      return true;
    case 'string':
      return stringExample(schema);
    default:
      return null;
  }
}

/**
 * @param {Json} schema
 * @returns {string}
 */
function stringExample(schema) {
  switch (schema.format) {
    case 'date-time':
      return '2026-01-31T09:30:00Z';
    case 'date':
      return '2026-01-31';
    case 'time':
      return '09:30:00';
    case 'email':
      return 'ada@example.com';
    case 'uuid':
      return '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    case 'uri':
    case 'url':
      return 'https://example.com';
    case 'hostname':
      return 'example.com';
    case 'ipv4':
      return '192.0.2.1';
    case 'ipv6':
      return '2001:db8::1';
    case 'byte':
      return 'U3dhZ2dlcg==';
    case 'password':
      return '********';
    default:
      return 'string';
  }
}
