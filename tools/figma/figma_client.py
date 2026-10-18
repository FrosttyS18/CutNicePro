#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cliente do Figma Dev Mode MCP Server (http://127.0.0.1:3845/mcp).

Gerencia a sessão (Mcp-Session-Id) automaticamente e salva os resultados:
  python tools/figma/figma_client.py shot <fileKey> <nodeId> <out.png>
  python tools/figma/figma_client.py context <fileKey> <nodeId> <out.json>
  python tools/figma/client.py ...
"""
import base64
import http.client
import json
import sys

HOST, PORT = "127.0.0.1", 3845
_session = {"id": None}


def _post(body):
    conn = http.client.HTTPConnection(HOST, PORT, timeout=300)
    headers = {"Content-Type": "application/json",
               "Accept": "application/json, text/event-stream"}
    if _session["id"]:
        headers["Mcp-Session-Id"] = _session["id"]
    conn.request("POST", "/mcp", body=json.dumps(body).encode(), headers=headers)
    resp = conn.getresponse()
    raw = resp.read().decode("utf-8", "replace")
    sid = resp.getheader("mcp-session-id")
    if sid:
        _session["id"] = sid
    status = resp.status
    conn.close()
    return status, raw


def _parse(raw):
    for line in raw.splitlines():
        if line.startswith("data: "):
            return json.loads(line[6:])
    try:
        return json.loads(raw)
    except Exception:
        return {"error": {"message": raw[:300]}}


def ensure_session():
    if _session["id"]:
        return
    body = {"jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {
        "protocolVersion": "2024-11-05", "capabilities": {},
        "clientInfo": {"name": "cutnicepro-zcode", "version": "1.0"}}}
    status, raw = _post(body)
    assert status == 200, raw[:200]
    _post({"jsonrpc": "2.0", "method": "notifications/initialized"})


def tool(name, arguments):
    ensure_session()
    status, raw = _post({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                         "params": {"name": name, "arguments": arguments}})
    return _parse(raw)


def save_screenshot(file_key, node, path, timeout_ms="60000"):
    out = tool("get_screenshot", {"fileKey": file_key, "nodeId": node,
                                  "timeout": int(timeout_ms)})
    imgs = [c for c in out.get("result", {}).get("content", [])
            if c.get("type") == "image"]
    if not imgs:
        return None, json.dumps(out)[:300]
    data = imgs[0]["data"]
    with open(path, "wb") as fh:
        fh.write(base64.b64decode(data))
    return path, None


def save_json(tool_name, file_key, node, path):
    out = tool(tool_name, {"fileKey": file_key, "nodeId": node})
    texts = [c.get("text", "") for c in out.get("result", {}).get("content", [])
             if c.get("type") == "text"]
    payload = texts[0] if texts else json.dumps(out)
    try:
        payload = json.dumps(json.loads(payload), ensure_ascii=False, indent=1)
    except Exception:
        pass
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(payload)
    return path


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "shot":
        p, err = save_screenshot(sys.argv[2], sys.argv[3], sys.argv[4])
        print(p or ("ERR " + err))
    elif cmd == "context":
        print(save_json("get_design_context", sys.argv[2], sys.argv[3], sys.argv[4]))
    elif cmd == "meta":
        print(save_json("get_metadata", sys.argv[2], sys.argv[3], sys.argv[4]))
    elif cmd == "vars":
        print(save_json("get_variable_defs", sys.argv[2], sys.argv[3], sys.argv[4]))
    elif cmd == "raw":
        print(json.dumps(tool(sys.argv[2], json.loads(sys.argv[3])),
                         ensure_ascii=False)[:8000])
    else:
        print(__doc__)
