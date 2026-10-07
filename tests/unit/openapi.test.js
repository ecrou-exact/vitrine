import { describe, expect, it } from 'vitest';
import {
  SpecError,
  exampleFor,
  mergeAllOf,
  pointer,
  readSpec,
  resolve,
  typeLabel,
} from '../../src/components/openapi/spec.js';

const SPEC = {
  openapi: '3.1.0',
  info: { title: 'Shop', version: '2.0.0' },
  servers: [{ url: 'https://{region}.example.com/v1', variables: { region: { default: 'eu' } } }],
  tags: [{ name: 'Orders', description: 'Order things' }],
  security: [{ bearer: [] }],
  paths: {
    '/orders/{id}': {
      parameters: [{ name: 'id', in: 'path', schema: { type: 'string' } }],
      get: {
        tags: ['Orders'],
        operationId: 'getOrder',
        parameters: [
          { name: 'id', in: 'path', description: 'Order id', schema: { type: 'integer' } },
        ],
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } },
          },
        },
      },
    },
    '/ping': { get: { responses: { 204: { description: 'Pong' } } } },
  },
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Order: {
        allOf: [
          { $ref: '#/components/schemas/Base' },
          { type: 'object', required: ['total'], properties: { total: { type: 'number' } } },
        ],
      },
      Base: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      Node: { type: 'object', properties: { child: { $ref: '#/components/schemas/Node' } } },
      'a/b': { type: 'string' },
    },
  },
};

describe('readSpec', () => {
  it('reads servers, tags, operations and security', () => {
    const model = readSpec(SPEC);
    expect(model).toMatchObject({ title: 'Shop', apiVersion: '2.0.0', version: '3.1.0' });
    expect(model.servers).toEqual([{ url: 'https://eu.example.com/v1', description: '' }]);
    expect(model.tags.map((t) => t.name)).toEqual(['Orders', 'default']);
    expect(model.securitySchemes).toEqual([
      { name: 'bearer', type: 'HTTP bearer (JWT)', description: '' },
    ]);
    const [op, ping] = model.operations;
    expect(op).toMatchObject({
      method: 'GET',
      path: '/orders/{id}',
      operationId: 'getOrder',
      security: ['bearer'],
    });
    // The operation parameter replaces the path parameter with the same name.
    expect(op.parameters).toHaveLength(1);
    expect(op.parameters[0]).toMatchObject({
      required: true,
      description: 'Order id',
      schema: { type: 'integer' },
    });
    expect(ping.tags).toEqual(['default']);
  });

  it('rejects documents that are not OpenAPI', () => {
    expect(() => readSpec({ hello: 1 })).toThrow(SpecError);
    expect(() => readSpec({ openapi: '4.0.0' })).toThrow(SpecError);
    expect(() => readSpec('text')).toThrow(SpecError);
  });

  it('reads Swagger 2.0 bodies, form fields and servers', () => {
    const model = readSpec({
      swagger: '2.0',
      info: { title: 'Old', version: '1' },
      host: 'api.example.com',
      basePath: '/v2',
      schemes: ['http', 'https'],
      paths: {
        '/pets': {
          post: {
            parameters: [
              { name: 'body', in: 'body', required: true, schema: { $ref: '#/definitions/Pet' } },
            ],
            responses: { 200: { description: 'ok', schema: { $ref: '#/definitions/Pet' } } },
          },
          put: {
            parameters: [{ name: 'name', in: 'formData', type: 'string', required: true }],
            responses: {},
          },
        },
      },
      definitions: { Pet: { type: 'object', properties: { name: { type: 'string' } } } },
    });
    expect(model.servers[0].url).toBe('https://api.example.com/v2');
    // Methods are read in the order of the specification: put, then post.
    const [put, post] = model.operations;
    expect(post.requestBody?.content[0]).toMatchObject({ type: 'application/json' });
    expect(post.responses[0].content[0].schema).toEqual({ $ref: '#/definitions/Pet' });
    expect(put.requestBody?.content[0].type).toBe('application/x-www-form-urlencoded');
  });
});

describe('references and schemas', () => {
  it('follows local pointers with escaped keys, and never external ones', () => {
    expect(pointer(SPEC, '#/components/schemas/a~1b')).toEqual({ type: 'string' });
    expect(pointer(SPEC, 'https://evil.example/spec.json#/x')).toBeUndefined();
    expect(resolve(SPEC, { $ref: '#/components/schemas/Missing' })).toBeNull();
    // A reference to itself does not loop.
    expect(resolve({ a: { $ref: '#/a' } }, { $ref: '#/a' })).toBeNull();
  });

  it('labels types', () => {
    expect(typeLabel(SPEC, { $ref: '#/components/schemas/Order' })).toBe('Order');
    expect(typeLabel(SPEC, { type: 'array', items: { $ref: '#/components/schemas/Base' } })).toBe(
      'array of Base',
    );
    expect(typeLabel(SPEC, { type: ['string', 'null'], format: 'date' })).toBe(
      'string (date) | null',
    );
    expect(typeLabel(SPEC, { enum: ['a', 'b'] })).toBe('"a" | "b"');
    expect(typeLabel(SPEC, { oneOf: [{ type: 'string' }, { type: 'integer' }] })).toBe(
      'one of: string, integer',
    );
  });

  it('merges allOf and builds examples, guarding against cycles', () => {
    const order = mergeAllOf(SPEC, resolve(SPEC, { $ref: '#/components/schemas/Order' }));
    expect(Object.keys(order.properties)).toEqual(['id', 'total']);
    expect(order.required).toEqual(['total']);
    expect(exampleFor(SPEC, { $ref: '#/components/schemas/Order' })).toEqual({
      id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      total: 0,
    });
    expect(exampleFor(SPEC, { $ref: '#/components/schemas/Node' })).toEqual({ child: null });
    expect(exampleFor(SPEC, { type: 'string', format: 'date-time' })).toBe('2026-01-31T09:30:00Z');
    expect(exampleFor(SPEC, { type: 'integer', example: 7 })).toBe(7);
  });
});
