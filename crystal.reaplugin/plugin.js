function createPlugin(host) {
  const service = "7fa2d10c-12f3-4b9e-9d77-1a9b65432100";
  const channels = {
    motorRpm: "7fa2d10c-12f3-4b9e-9d77-1a9b65432101",
    feedRpm: "7fa2d10c-12f3-4b9e-9d77-1a9b65432102",
    bootSign: "7fa2d10c-12f3-4b9e-9d77-1a9b65432103",
    servoAngle: "7fa2d10c-12f3-4b9e-9d77-1a9b65432105",
    targetAngle: "7fa2d10c-12f3-4b9e-9d77-1a9b65432106",
  };
  const order = ["motorRpm", "feedRpm", "bootSign", "servoAngle", "targetAngle"];
  const ranges = {
    motorRpm: [0, 1500, 1000],
    feedRpm: [0, 150, 10],
    bootSign: [0, 10, 1],
    servoAngle: [0, 1500, 1],
    targetAngle: [0, 1500, 1],
  };
  const bootLabels = {
    1: ["Manual start", "手动启动"],
    2: ["Timed start", "定时启动"],
    3: ["Smart start", "智能启动"],
    4: ["Stop", "停止"],
    5: ["Sync grind size", "研磨度同步"],
  };
  const mirrorKey = {
    motorRpm: "writeMotorRpm",
    feedRpm: "writeFeedRpm",
    targetAngle: "writeTargetAngle",
  };
  const applyDelayMs = 120;
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  // Every value on the wire is a UInt16, big-endian, exactly two bytes.
  function decodeUint16(bytes) {
    return ((bytes[0] << 8) | bytes[1]) & 0xffff;
  }

  function encodeUint16(value) {
    const clamped = Math.max(0, Math.min(0xffff, Math.round(Number(value))));
    return [(clamped >> 8) & 0xff, clamped & 0xff];
  }

  function decodeBase64(data) {
    if (typeof data !== "string" || data.length % 4 !== 0) return null;
    const bytes = [];
    for (let i = 0; i < data.length; i += 4) {
      const a = alphabet.indexOf(data[i]);
      const b = alphabet.indexOf(data[i + 1]);
      const c = data[i + 2] === "=" ? 0 : alphabet.indexOf(data[i + 2]);
      const d = data[i + 3] === "=" ? 0 : alphabet.indexOf(data[i + 3]);
      if (a < 0 || b < 0 || c < 0 || d < 0) return null;
      bytes.push((a << 2) | (b >> 4));
      if (data[i + 2] !== "=") bytes.push(((b & 15) << 4) | (c >> 2));
      if (data[i + 3] !== "=") bytes.push(((c & 3) << 6) | d);
    }
    return bytes;
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function renderUi() {
    return [
      '<!doctype html><html lang="zh"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>CRYSTAL Grinder</title><style>',
      ':root{--bg:#0b0b0d;--card:#16161a;--line:#28282f;--fg:#ececf1;--muted:#8b8b96;--accent:#a78bfa}',
      '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);',
      'font:14px/1.5 ui-sans-serif,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}',
      'header{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line)}',
      'h1{font-size:16px;margin:0;font-weight:600}',
      '.dot{width:8px;height:8px;border-radius:50%;background:#ef4444}.dot.on{background:var(--accent)}',
      '#conn{color:var(--muted);font-size:12px}',
      'button{background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:8px;',
      'padding:6px 10px;font:inherit;cursor:pointer}button:hover{border-color:#3f3f4a}',
      'main{padding:16px 20px;display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));align-items:start}',
      '.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}',
      'h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 10px}',
      '.readout{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:28px;align-items:baseline}',
      '.big{font-size:52px;font-weight:600;font-variant-numeric:tabular-nums}',
      '.big small{font-size:16px;color:var(--muted);margin-left:6px;font-weight:400}',
      '.sub{color:var(--muted)}.sub b{color:var(--fg);font-weight:600}',
      'table{width:100%;border-collapse:collapse}td{padding:5px 0;vertical-align:middle;font-size:13px}',
      'td:first-child{color:var(--muted)}td:last-child{text-align:right;font-weight:500;font-variant-numeric:tabular-nums}',
      'code{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}',
      '.row{display:grid;grid-template-columns:104px 1fr 62px 46px;gap:8px;align-items:center;padding:6px 0}',
      '.row label{color:var(--muted);font-size:13px}',
      '.row input[type=number]{background:#0f0f12;border:1px solid var(--line);color:var(--fg);',
      'border-radius:6px;padding:3px 6px;font:inherit;width:100%;text-align:right}',
      'input[type=range]{width:100%;accent-color:var(--accent)}',
      '.chips{display:flex;flex-wrap:wrap;gap:8px}',
      '.chip{padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:#1d1d22;',
      'cursor:pointer;font-size:13px}.chip:hover{border-color:#3f3f4a}.chip.on{border-color:var(--accent);color:var(--accent)}',
      '.apply{margin-top:10px;border-color:var(--accent);color:var(--accent);width:100%;padding:9px}',
      '#logs{max-height:300px;overflow:auto;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}',
      '.log{display:flex;gap:8px;padding:2px 0;border-bottom:1px solid #1e1e23}',
      '.log i{font-style:normal;flex:0 0 46px;color:var(--muted)}',
      '.log.read i{color:#60a5fa}.log.write i{color:#fbbf24}.log.notify i{color:#6b7280}.log.error i{color:#f87171}',
      '.log span{word-break:break-all;color:#c9c9d1}',
      '.note{color:var(--muted);font-size:12px;margin-top:8px}',
      '</style></head><body>',
      '<header><h1>CRYSTAL Grinder</h1><span class="dot" id="dot"></span>',
      '<span id="conn">--</span><span style="flex:1"></span>',
      '<button id="refresh">Refresh</button><button id="lang">English</button></header>',
      '<main>',
      '<section class="card readout">',
      '<div><div class="big"><span id="servoAngle">--</span><small id="servoUnit">current</small></div>',
      '<div class="sub" id="targetLine">--</div></div>',
      '<div class="sub" id="rpmLine"></div>',
      '</section>',
      '<section class="card"><h2 id="h-live">Characteristics</h2><table id="table"></table></section>',
      '<section class="card"><h2 id="h-set">Write</h2><div id="sliders"></div>',
      '<h2 id="h-boot" style="margin-top:14px">Boot</h2><div class="chips" id="boot"></div>',
      '<button class="apply" id="apply">&#9889; Set target and apply</button>',
      '<div class="note" id="note"></div></section>',
      '<section class="card"><h2>Logs</h2><div id="logs"></div></section>',
      '</main><script>',
      'var ENDPOINT=location.pathname;',
      'var LANG="zh";',
      'var T={zh:{live:"特征值实时总览",write:"写入",boot:"启动项",refresh:"刷新",',
      'connected:"已连接",offline:"未连接",apply:"\\u26a1 \\u8bbe\\u7f6e\\u5e76\\u5e94\\u7528",',
      'note:"\\u8bbe\\u7f6e\\u5e76\\u5e94\\u7528 = \\u5199\\u76ee\\u6807\\u7814\\u78e8\\u5ea6 \\u2192 120ms \\u2192 \\u5199\\u542f\\u52a8\\u9879=5(\\u7814\\u78e8\\u5ea6\\u540c\\u6b65)\\u3002\\u7535\\u673a/\\u4e0b\\u8c46\\u8f6c\\u901f\\u5728\\u542f\\u52a8\\u7814\\u78e8\\u540e\\u624d\\u751f\\u6548\\u3002",',
      'current:"\\u5f53\\u524d\\u7814\\u78e8\\u5ea6",target:"\\u76ee\\u6807\\u7814\\u78e8\\u5ea6"},',
      'en:{live:"Characteristics",write:"Write",boot:"Boot",refresh:"Refresh",connected:"Connected",',
      'offline:"Not connected",apply:"&#9889; Set target and apply",',
      'note:"Set-and-apply writes the target angle, waits 120 ms, then writes boot sign 5 to sync it. Motor and feed RPM take effect once grinding starts.",',
      'current:"current",target:"target"}};',
      'var LABELS={motorRpm:["Motor RPM","\\u7535\\u673a\\u8f6c\\u901f"],feedRpm:["Feed RPM","\\u4e0b\\u8c46\\u8f6c\\u901f"],',
      'bootSign:["Boot sign","\\u542f\\u52a8\\u9879"],servoAngle:["Servo angle","\\u5f53\\u524d\\u7814\\u78e8\\u5ea6"],',
      'targetAngle:["Target angle","\\u76ee\\u6807\\u7814\\u78e8\\u5ea6"]};',
      'var ORDER=["motorRpm","feedRpm","bootSign","servoAngle","targetAngle"];',
      'var WRITABLE={motorRpm:1,feedRpm:1,bootSign:1,targetAngle:1};',
      'var RANGES={motorRpm:[0,1500,1000],feedRpm:[0,150,10],bootSign:[0,10,1],targetAngle:[0,1500,1]};',
      'var BOOT_LABELS={1:["Manual","\\u624b\\u52a8"],2:["Timed","\\u5b9a\\u65f6"],3:["Smart","\\u667a\\u80fd"],',
      '4:["Stop","\\u505c\\u6b62"],5:["Sync","\\u7814\\u78e8\\u5ea6\\u540c\\u6b65"]};',
      'var UUID={motorRpm:"\\u202601",feedRpm:"\\u202602",bootSign:"\\u202603",servoAngle:"\\u202605",targetAngle:"\\u202606"};',
      'var PROPS={motorRpm:"R/W/N",feedRpm:"R/W/N",bootSign:"R/W/N",servoAngle:"R/N",targetAngle:"R/W/N"};',
      'var cached={values:{},logs:[]};var built=false;var deb={};',
      'function t(k){return T[LANG][k]}',
      'function label(k){var e=LABELS[k];return e?(LANG==="zh"?e[1]:e[0]):k}',
      'function bootLabel(v){var e=BOOT_LABELS[v];if(!e)return v;return LANG==="zh"?e[1]:e[0]}',
      'function post(commandId,params){return fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},',
      'body:JSON.stringify({commandId:commandId,params:params||{}})}).then(function(r){return r.json()}).then(function(r){',
      'if(!r.ok)throw new Error(r.error);return r.result})}',
      'function buildControls(){var host=document.getElementById("sliders");',
      'Object.keys(RANGES).forEach(function(key){var r=RANGES[key];',
      'var row=document.createElement("div");row.className="row";row.dataset.key=key;',
      'row.innerHTML=\'<label></label><input type="range"><input type="number"><span></span>\';',
      'var labelEl=row.querySelector("label"),range=row.querySelector("input[type=range]"),',
      'num=row.querySelector("input[type=number]"),unit=row.querySelector("span");',
      'labelEl.textContent=label(key);range.min=r[0];range.max=r[1];range.step=r[2];num.step=r[2];',
      'unit.textContent="";',
      'function send(v){clearTimeout(deb[key]);deb[key]=setTimeout(function(){',
      'var p={};p.value=Number(v);var id="write"+key.charAt(0).toUpperCase()+key.slice(1);',
      'post(id,p).catch(function(e){console.warn(e)})},250)}',
      'range.addEventListener("input",function(){num.value=range.value;send(range.value)});',
      'num.addEventListener("change",function(){range.value=num.value;send(num.value)});',
      'host.appendChild(row)});',
      'var boot=document.getElementById("boot");',
      'Object.keys(BOOT_LABELS).forEach(function(k){var b=document.createElement("button");',
      'b.className="chip";b.textContent=Number(k)+" "+bootLabel(Number(k));',
      'b.addEventListener("click",function(){post("writeBootSign",{value:Number(k)}).catch(function(e){console.warn(e)})});',
      'boot.appendChild(b)});',
      'document.getElementById("apply").addEventListener("click",function(){',
      'var row=document.querySelector(\'.row[data-key="targetAngle"]\');',
      'post("setAndApply",{value:Number(row.querySelector("input[type=number]").value)}).catch(function(e){console.warn(e)})});',
      'document.getElementById("refresh").addEventListener("click",function(){post("readAll",{}).catch(function(){})});',
      'built=true}',
      'function paintTable(v){var rows=ORDER.map(function(k){var val=v[k];',
      'return "<tr><td>"+label(k)+" <code>"+UUID[k]+"</code> "+PROPS[k]+"</td><td>"+(val===null||val===undefined?"\\u2014":val)+"</td></tr>"});',
      'document.getElementById("table").innerHTML=rows.join("")}',
      'function paintControls(v){if(!built)return;',
      'Object.keys(RANGES).forEach(function(key){var row=document.querySelector(\'.row[data-key="\'+key+\'"]\');',
      'if(!row)return;var val=v[key];if(val===null||val===undefined)return;',
      'if(document.activeElement!==row.querySelector("input[type=range]")&&',
      'document.activeElement!==row.querySelector("input[type=number]")){',
      'row.querySelector("input[type=range]").value=val;row.querySelector("input[type=number]").value=val}})',
      'var boot=document.querySelectorAll("#boot .chip");var cur=v.bootSign;',
      'boot.forEach(function(b,i){b.className="chip"+((i+1)===cur?" on":"")})}',
      'function paintLogs(logs){document.getElementById("logs").innerHTML=logs.slice().reverse().map(function(l){',
      'return \'<div class="log \'+l.kind+\'"><i>\'+l.kind+\'</i><span>\'+String(l.text).replace(/[<>&]/g,"")+"</span></div>"}).join("")}',
      'function apply(d){if(!d)return;cached=d;var v=d.values||{};var c=!!d.connected;',
      'document.getElementById("dot").className="dot"+(c?" on":"");',
      'document.getElementById("conn").textContent=c?t("connected"):t("offline");',
      'document.getElementById("servoAngle").textContent=(v.servoAngle===null||v.servoAngle===undefined)?"--":v.servoAngle;',
      'document.getElementById("servoUnit").textContent=t("current");',
      'document.getElementById("targetLine").textContent=t("target")+" "+(v.targetAngle===null||v.targetAngle===undefined?"\\u2014":v.targetAngle);',
      'document.getElementById("rpmLine").innerHTML=\'<b>\'+(v.motorRpm===null||v.motorRpm===undefined?"\\u2014":v.motorRpm)+\'</b> motor &middot; <b>\'+',
      '(v.feedRpm===null||v.feedRpm===undefined?"\\u2014":v.feedRpm)+\'</b> feed\';',
      'paintTable(v);paintControls(v);paintLogs(d.logs||[])}',
      'function labels(){document.getElementById("h-live").textContent=t("live");',
      'document.getElementById("h-set").textContent=t("write");document.getElementById("h-boot").textContent=t("boot");',
      'document.getElementById("refresh").textContent=t("refresh");document.getElementById("apply").textContent=t("apply");',
      'document.getElementById("note").textContent=t("note");',
      'document.querySelectorAll(".row").forEach(function(r){r.querySelector("label").textContent=label(r.dataset.key)});',
      'document.querySelectorAll("#boot .chip").forEach(function(b,i){b.textContent=(i+1)+" "+bootLabel(i+1)});',
      'document.getElementById("lang").textContent=LANG==="zh"?"English":"\\u4e2d\\u6587"}',
      'function tick(){fetch(ENDPOINT+"?state=1").then(function(r){return r.json()}).then(apply).catch(function(){})}',
      'document.getElementById("lang").addEventListener("click",function(){LANG=LANG==="zh"?"en":"zh";labels()});',
      'labels();buildControls();tick();setInterval(tick,700);',
      '</script></body></html>',
    ].join("");
  }

  // The loader aliases `handleHttpRequest` on the object `createPlugin`
  // returns, not on the device the driver factory returns.
  let deviceHandler = null;

  return {
    id: "crystal.reaplugin",
    handleHttpRequest(request) {
      const json = (value) => ({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (request.method === "GET") {
        if (request.query && request.query.state === "1") {
          return json(
            deviceHandler
              ? deviceHandler.state()
              : { connected: false, values: {}, logs: [] }
          );
        }
        return {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
          body: renderUi(),
        };
      }
      if (request.method === "POST") {
        if (!deviceHandler) {
          return json({ ok: false, error: "no CRYSTAL device bound" });
        }
        return Promise.resolve(deviceHandler.post(request.body || {})).then(
          json
        );
      }
      return {
        status: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "method not allowed" }),
      };
    },
    onLoad() {
      return host.devices.bindDriver("crystal", {
        create(device) {
          let context = null;
          const values = {};
          const logs = [];

          function log(kind, text) {
            logs.push({ kind, text, at: Date.now() });
            if (logs.length > 200) logs.splice(0, logs.length - 200);
          }

          function requireSession() {
            if (!context) throw new Error("CRYSTAL session is not connected");
            return context;
          }

          async function readChannel(key) {
            const session = requireSession();
            const raw = await session.gatt.read(service, channels[key]);
            const bytes = decodeBase64(raw);
            if (!bytes || bytes.length < 2) return null;
            const value = decodeUint16(bytes);
            values[key] = value;
            log("read", `${key} = ${value} (${bytes.slice(0, 2).join(" ")})`);
            return value;
          }

          async function writeChannel(key, value) {
            const session = requireSession();
            const bytes = encodeUint16(value);
            await session.gatt.writeWithResponse(
              service,
              channels[key],
              btoa(String.fromCharCode(...bytes))
            );
            log("write", `${key} = ${bytes[0]} ${bytes[1]} (${Math.round(value)})`);
            return Math.round(value);
          }

          function publish() {
            if (!context) return;
            const snapshot = {};
            for (const key of order) {
              if (values[key] !== undefined) snapshot[key] = values[key];
            }
            if (Object.keys(snapshot).length === 0) return;
            // Publication crosses the Dart bridge asynchronously, so a
            // validation failure surfaces as a rejection rather than a throw.
            Promise.resolve(context.publish(snapshot)).catch((error) =>
              log(
                "error",
                "publish: " +
                  String(error && error.message ? error.message : error)
              )
            );
          }

          async function readAll() {
            for (const key of order) {
              try {
                await readChannel(key);
              } catch (error) {
                log("error", `${key} read failed: ${error}`);
              }
            }
            publish();
            return { ...values };
          }

          async function setAndApply(value) {
            await writeChannel("targetAngle", value);
            await delay(applyDelayMs);
            await writeChannel("bootSign", 5);
            await readAll();
            return { ...values };
          }

          const dataChannels = [
            { key: "motorRpm", type: "integer", unit: "rpm" },
            { key: "feedRpm", type: "integer", unit: "rpm" },
            { key: "bootSign", type: "integer" },
            { key: "servoAngle", type: "integer" },
            { key: "targetAngle", type: "integer" },
          ];

          const numberParam = {
            type: "object",
            properties: { value: { type: "integer" } },
            required: ["value"],
          };

          const commands = [
            {
              id: "getValues",
              name: "Read every characteristic",
              paramsSchema: { type: "object" },
              resultsSchema: { type: "object" },
            },
            {
              id: "readAll",
              name: "Re-read every characteristic",
              paramsSchema: { type: "object" },
              resultsSchema: { type: "object" },
            },
            {
              id: "writeMotorRpm",
              name: "Write motor RPM",
              paramsSchema: numberParam,
              resultsSchema: { type: "object" },
            },
            {
              id: "writeFeedRpm",
              name: "Write feed RPM",
              paramsSchema: numberParam,
              resultsSchema: { type: "object" },
            },
            {
              id: "writeBootSign",
              name: "Write boot sign",
              paramsSchema: numberParam,
              resultsSchema: { type: "object" },
            },
            {
              id: "writeTargetAngle",
              name: "Write target grind size",
              paramsSchema: numberParam,
              resultsSchema: { type: "object" },
            },
            {
              id: "setAndApply",
              name: "Set target grind size and apply",
              paramsSchema: numberParam,
              resultsSchema: { type: "object" },
            },
          ];

          async function execute({ commandId, params }) {
            const input = params || {};
            switch (commandId) {
              case "getValues":
                return { ...values };
              case "readAll":
                return readAll();
              case "writeMotorRpm":
                await writeChannel("motorRpm", input.value);
                return { ...values };
              case "writeFeedRpm":
                await writeChannel("feedRpm", input.value);
                return { ...values };
              case "writeBootSign":
                await writeChannel("bootSign", input.value);
                return { ...values };
              case "writeTargetAngle":
                await writeChannel("targetAngle", input.value);
                return { ...values };
              case "setAndApply":
                return setAndApply(input.value);
              default:
                throw new Error(`Unknown CRYSTAL command: ${commandId}`);
            }
          }

          async function handlePost(body) {
            try {
              const result = await execute({
                commandId: body.commandId,
                params: body.params || {},
              });
              return { ok: true, result };
            } catch (error) {
              return {
                ok: false,
                error: String(error && error.message ? error.message : error),
              };
            }
          }

          function uiState() {
            return {
              connected: context !== null,
              values: { ...values },
              logs: logs.slice(-120),
            };
          }

          deviceHandler = { state: uiState, post: handlePost };

          return {
            vendor: "CRYSTAL",
            dataChannels,
            commands,
            async connect(session) {
              const services = await session.gatt.discoverServices();
              if (!services.includes(service)) {
                throw new Error("CRYSTAL service unavailable");
              }
              context = session;
              session.gatt.onDisconnect(() => {
                context = null;
                log("error", "disconnected");
              });
              for (const key of order) {
                await session.gatt.subscribe(
                  service,
                  channels[key],
                  (data) => {
                    const bytes = decodeBase64(data);
                    if (!bytes || bytes.length < 2) return;
                    values[key] = decodeUint16(bytes);
                    log(
                      "notify",
                      `${key} = ${values[key]} (${bytes.slice(0, 2).join(" ")})`
                    );
                    publish();
                  }
                );
              }
              await readAll();
            },
            disconnect() {
              context = null;
            },
            execute,
          };
        },
      });
    },
  };
}
