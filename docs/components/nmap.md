# `<vt-nmap>`

`<vt-nmap>` shows the results of an Nmap scan: hosts with their addresses, names, OS guess and latency, and their ports as a table with state, service, version and script output. Services that are risky to expose are marked.

```html
<vt-nmap variant="full" src="scan.xml"></vt-nmap>
```

The element only reads the results: nothing is scanned or fetched.

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |

## Input

| Format   | Option                 | Read                                                                                                                                                                                                                                                                 |
| -------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XML      | `-oX`                  | Command, start time, elapsed time, hosts (status, addresses, MAC vendor, host names, latency, best OS match), ports (state, reason, service, product, version, extra info, TLS) and port and host scripts. Read with the bounded XML reader of [`<vt-xml>`](xml.md). |
| Normal   | `-oN`, or the terminal | Host reports, latency, MAC address, OS details, the port table (with or without `VERSION`), script output (`                                                                                                                                                         | ` lines). |
| Grepable | `-oG`                  | Hosts, status, ports with state, service and version.                                                                                                                                                                                                                |

The format is found from the text.

## Ports

Open ports are shown by default; the filter button, or `all`, shows closed and filtered ports too. Hosts that are down are hidden unless `down` is set. States are written in words (Open, Closed, Filtered, Open or filtered…).

Script output is shown under its port: one line inline, longer output folded in a `<details>`. Host scripts follow the table.

## Risky services

An open port is marked "Exposed" when it runs a service that should rarely face the Internet: clear-text logins (FTP 21, Telnet 23, rexec, rlogin, rsh), remote desktops (RDP 3389, VNC 5900), Windows and file sharing (MSRPC 135, NetBIOS 139, SMB 445, NFS 2049, rsync 873), SNMP 161, TFTP 69, rpcbind 111, the Docker API 2375 and databases that often run without a password (MySQL, PostgreSQL, MSSQL, Oracle, Redis, MongoDB, Elasticsearch, Memcached, CouchDB). The summary counts them. `risky="false"` removes the marks.

The mark is a hint for review: a service on an internal network, or behind authentication, may be fine.

## Attributes

| Attribute | Values  | Default | Description                             |
| --------- | ------- | ------- | --------------------------------------- |
| `all`     | boolean | off     | Also show closed and filtered ports.    |
| `down`    | boolean | off     | Also show hosts that are down.          |
| `scripts` | boolean | on      | Script output under each port and host. |
| `risky`   | boolean | on      | Mark services that are risky to expose. |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

## Copy

| Button                     | Output                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| CSV                        | `host,hostname,port,protocol,state,service,version`, one line per port; cells a spreadsheet would run as a formula are prefixed. |
| Copy hosts with open ports | One address per line.                                                                                                            |

## Properties

| Property  | Type             | Description                                                                                                                                                                                                                                      |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `content` | `string`         | The Nmap output.                                                                                                                                                                                                                                 |
| `scan`    | `object \| null` | Read-only: `{ command, started, elapsed, summary, hosts }`; each host `{ address, addressType, mac, vendor, hostnames, status, latency, os, ports, scripts }`; each port `{ port, protocol, state, reason, service, version, tunnel, scripts }`. |

## Events

| Event      | Detail               | When                                 |
| ---------- | -------------------- | ------------------------------------ |
| `vt-ready` | `{ type: "nmap" }`   | The scan is rendered.                |
| `vt-copy`  | `{ text }`           | The CSV or the hosts are copied.     |
| `vt-error` | `{ message, cause }` | Loading failed or content too large. |

## CSS parts

| Part      | Element                      |
| --------- | ---------------------------- |
| `summary` | The summary line.            |
| `host`    | A host.                      |
| `ports`   | The ports table of a host.   |
| `state`   | The state of a port.         |
| `risky`   | The mark of a risky service. |
| `script`  | A script output.             |

## Accessibility

Each host is a labelled section with a heading. States and marks are words, with an icon for risky services; colors only repeat them. The ports table has column and row headers.

## Security

Every value is inserted as text; script output is never interpreted. XML is read with the bounded reader of `<vt-xml>`: no entity expansion, no DTD, nothing fetched. At most 5,000 hosts and 50,000 ports are read.
