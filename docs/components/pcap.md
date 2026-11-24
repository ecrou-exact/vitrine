# `<vt-pcap>`

`<vt-pcap>` reads packet captures in the page and shows:

- **Packets**: time, source, destination, protocol, length and a one-line summary.
- **One packet opened**: its layers, with each field tied to its bytes in a hex dump.
- **Conversations**: the traffic between each pair of endpoints.
- **Host names**: the names seen in the capture, ready to copy as indicators.

```html
<vt-pcap variant="full" src="capture.pcapng"></vt-pcap>
```

Files are read in memory and sent nowhere.

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |
| `tabs`       | on                 | on     |

## Input

The capture can come from several places:

- `src`, fetched as binary with the usual origin and size rules;
- a file dropped on the element or chosen in its field, up to 64 MB;
- the `bytes` property or the `file` property;
- base64 (or hex) text written inside the element.

Without a capture, the element shows a zone to drop a file. With `file="false"`, it shows a notice instead.

Formats:

- **pcap**: microsecond and nanosecond timestamps, both byte orders.
- **pcapng**: section, interface, enhanced, simple and obsolete packet blocks, with interface names and timestamp resolutions.

Up to 20,000 packets are read. A file cut in the middle of a packet keeps the packets before it, with a notice.

Link types:

- Ethernet, with 802.1Q and 802.1ad VLAN tags;
- Linux cooked captures v1 and v2 (`tcpdump -i any`);
- BSD loopback;
- raw IPv4 and IPv6.

## Protocols

| Layer            | Fields decoded                                                                                                   | Summary                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Ethernet         | Destination, source, type, VLAN                                                                                  |                                                         |
| ARP              | Operation, sender and target MAC and IP                                                                          | `Who has 192.168.1.1? Tell 192.168.1.20`                |
| IPv4             | Version, header length, total length, identification, flags, fragment offset, TTL, protocol, checksum, addresses | Fragments are marked                                    |
| IPv6             | Flow label, payload length, next header, hop limit, addresses; extension headers skipped                         |                                                         |
| ICMP, ICMPv6     | Type in words, code, identifier and sequence of echoes                                                           | `Echo request id=4660 seq=1`                            |
| TCP              | Ports, relative and absolute sequence and acknowledgment, flags, window, checksum                                | `51514 → 443 [SYN, ACK] Seq=0 Ack=1 Win=64240 Len=0`    |
| UDP              | Ports, length, checksum                                                                                          |                                                         |
| DNS, mDNS, LLMNR | ID, query or response, reply code, questions and answers (A, AAAA, CNAME, NS, PTR, MX, TXT), names decompressed  | `Response 0x2a1f A login.shop.example → A 198.51.100.7` |
| HTTP/1           | Request or status line, headers                                                                                  | `GET /login HTTP/1.1`                                   |
| TLS              | Records, handshake type, version, cipher suites, server name (SNI), ALPN, supported versions                     | `Client Hello (login.shop.example)`                     |

Other TCP and UDP traffic is named from well-known ports (SSH, SMB, RDP, NTP, DHCP…). The protocol column shows the highest layer decoded.

## Views

- **Summary**: packets, duration, first timestamp in UTC, bytes on the wire, link type, interface names, the most common protocols. With `file` on, a button opens another file.
- **Packets**: with `filters` (on by default), there is a button per protocol and a field. The field keeps packets whose address, port, protocol, summary or host name contains the text; a number alone matches a port. A packet number opens the packet below the list.
- **Packet**: each layer is a disclosure with its byte range and its fields. A field's name is a button: pressed, it highlights the field's bytes in the hex dump.
- **Conversations**: each pair of endpoints (address and port), with its transport and main protocol. Then its packets, bytes, start and duration, the busiest first.
- **Host names**: each name, where it was seen (DNS, TLS server name, HTTP Host), what it resolves to and in which packets.

## Attributes

| Attribute | Values                              | Default   | Description                                          |
| --------- | ----------------------------------- | --------- | ---------------------------------------------------- |
| `view`    | `packets`, `conversations`, `names` | `packets` | Tab shown first.                                     |
| `filters` | boolean                             | on        | Protocol and text filters.                           |
| `file`    | boolean                             | on        | A zone to drop or choose a capture.                  |
| `defang`  | boolean                             | off       | Show host names defanged (`login[.]shop[.]example`). |
| `tabs`    | boolean                             | on        | The Packets, Conversations and Host names tabs.      |

The shared attributes (`variant`, `theme`, `src`, `allow-remote`, `label`, `copy`…) are described in [common attributes](../common-attributes.md). Captures fetched with `src` follow `Vitrine.configure({ maxSize })` (see [configuration](../configuration.md)).

## Copy

| Button         | Output                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| CSV            | `No.,Time,Source,Destination,Protocol,Length,Info`, the packets shown. Cells a spreadsheet would run as a formula are prefixed. |
| Copy the names | The host names, one per line (defanged with `defang`).                                                                          |

## Properties

| Property  | Type             | Description                                                                                                                                                                                                                                                                                        |
| --------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content` | `string`         | The capture as base64 or hex text.                                                                                                                                                                                                                                                                 |
| `bytes`   | `Uint8Array`     | The capture. Setting it overrides `src` and `content`.                                                                                                                                                                                                                                             |
| `file`    | `File \| null`   | A capture file to read.                                                                                                                                                                                                                                                                            |
| `capture` | `object \| null` | Read-only. It has the form `{ format, linkType, interfaces, packets, capped, truncated }`. Each packet is `{ index, time, length, data, linkType, summary }`. `time` is in microseconds since the epoch. `summary` is `{ src, dst, srcPort, dstPort, protocol, info, names, answers, transport }`. |

## Events

| Event              | Detail                        | When                              |
| ------------------ | ----------------------------- | --------------------------------- |
| `vt-ready`         | `{ type: "pcap" }`            | The capture is rendered.          |
| `vt-tab-change`    | `{ tab }`                     | The tab changed.                  |
| `vt-filter-change` | `{ protocols, query, shown }` | The filters changed.              |
| `vt-select`        | `{ index, protocol, info }`   | A packet was opened.              |
| `vt-copy`          | `{ text }`                    | CSV or names copied.              |
| `vt-error`         | `{ message, cause }`          | Loading failed or file too large. |

## CSS parts

| Part            | Element                           |
| --------------- | --------------------------------- |
| `summary`       | The summary of the capture.       |
| `zone`          | The zone where a file is dropped. |
| `filters`       | The filters.                      |
| `packets`       | The table of packets.             |
| `packet`        | The opened packet.                |
| `layers`        | Its layers and fields.            |
| `dump`          | Its bytes.                        |
| `conversations` | The table of conversations.       |
| `names`         | The table of host names.          |

## Accessibility

Packets, conversations and names are tables with column headers. The number of each packet is a toggle button (`aria-pressed`) named "Packet N". Layers are native disclosures, and fields are toggle buttons whose title gives their byte range. Filters are toggle buttons. Protocols are written in words; colors only repeat them.

## Security

Packets are parsed with bounds checks on every read:

- DNS compression pointers stop after 20 jumps;
- labels, records and extensions are checked against their message;
- at most 20,000 packets are read, and the dump shows the first 64 KB of a packet.

Text from packets (DNS names, HTTP lines, server names) is decoded as UTF-8. Control, zero-width and direction characters are shown as `\xNN`. Everything is inserted as text, and names are never links. Nothing is sent, resolved or fetched, except `src`. CSV cells that could run as formulas are prefixed.
