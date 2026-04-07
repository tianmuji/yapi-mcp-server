"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatListMenu = formatListMenu;
exports.formatInterfaceDetail = formatInterfaceDetail;
exports.formatProjectInfo = formatProjectInfo;
/** Format interface list menu (categories + interfaces) into concise text */
function formatListMenu(data) {
    if (!Array.isArray(data) || data.length === 0)
        return "No interfaces found.";
    const lines = [];
    for (const cat of data) {
        lines.push(`\n## ${cat.name || "Uncategorized"} (catid: ${cat._id})`);
        const items = cat.list || [];
        if (items.length === 0) {
            lines.push("  (empty)");
            continue;
        }
        for (const item of items) {
            const status = item.status === "done" ? "✓" : "○";
            lines.push(`  ${status} [${item.method?.toUpperCase() || "?"}] ${item.path || "/"} — ${item.title || "Untitled"} (id: ${item._id})`);
        }
    }
    return lines.join("\n");
}
/** Format a single interface detail into readable text */
function formatInterfaceDetail(data) {
    if (!data)
        return "Interface not found.";
    const lines = [];
    lines.push(`# ${data.title || "Untitled"}`);
    lines.push(`**Method:** ${data.method?.toUpperCase() || "?"}`);
    lines.push(`**Path:** ${data.path || "/"}`);
    lines.push(`**Status:** ${data.status || "unknown"}`);
    if (data.desc)
        lines.push(`**Description:** ${data.desc}`);
    if (data.markdown)
        lines.push(`**Docs:**\n${data.markdown}`);
    lines.push(`**Tag:** ${(data.tag || []).join(", ") || "none"}`);
    // Request params
    if (data.req_headers && data.req_headers.length > 0) {
        lines.push("\n## Request Headers");
        for (const h of data.req_headers) {
            const req = h.required === "1" ? "*" : "";
            lines.push(`  - ${h.name}${req}: ${h.value || ""} ${h.desc ? `(${h.desc})` : ""}`);
        }
    }
    if (data.req_params && data.req_params.length > 0) {
        lines.push("\n## Path Parameters");
        for (const p of data.req_params) {
            lines.push(`  - ${p.name}: ${p.desc || ""}`);
        }
    }
    if (data.req_query && data.req_query.length > 0) {
        lines.push("\n## Query Parameters");
        for (const q of data.req_query) {
            const req = q.required === "1" ? "*" : "";
            lines.push(`  - ${q.name}${req}: ${q.desc || ""} ${q.example ? `(example: ${q.example})` : ""}`);
        }
    }
    if (data.req_body_type) {
        lines.push(`\n## Request Body (${data.req_body_type})`);
        if (data.req_body_type === "json" && data.req_body_other) {
            lines.push("```json");
            lines.push(tryFormatJson(data.req_body_other));
            lines.push("```");
        }
        else if (data.req_body_type === "form" && data.req_body_form?.length > 0) {
            for (const f of data.req_body_form) {
                const req = f.required === "1" ? "*" : "";
                lines.push(`  - ${f.name}${req} (${f.type || "text"}): ${f.desc || ""}`);
            }
        }
        else if (data.req_body_other) {
            lines.push(data.req_body_other);
        }
    }
    // Response
    if (data.res_body) {
        lines.push(`\n## Response Body (${data.res_body_type || "json"})`);
        lines.push("```json");
        lines.push(tryFormatJson(data.res_body));
        lines.push("```");
    }
    return lines.join("\n");
}
/** Format project info */
function formatProjectInfo(data) {
    if (!data)
        return "Project not found.";
    const lines = [];
    lines.push(`# ${data.name || "Untitled Project"}`);
    if (data.desc)
        lines.push(`**Description:** ${data.desc}`);
    lines.push(`**Base Path:** ${data.basepath || "/"}`);
    lines.push(`**Project ID:** ${data._id}`);
    lines.push(`**Group ID:** ${data.group_id}`);
    if (data.tag?.length > 0) {
        lines.push(`**Tags:** ${data.tag.map((t) => t.name).join(", ")}`);
    }
    return lines.join("\n");
}
function tryFormatJson(str) {
    try {
        return JSON.stringify(JSON.parse(str), null, 2);
    }
    catch {
        return str;
    }
}
