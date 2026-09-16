"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashCanonicalJson = hashCanonicalJson;
const node_crypto_1 = require("node:crypto");
function updateCanonicalJson(hash, value) {
    if (Array.isArray(value)) {
        hash.update('[');
        value.forEach((entry, index) => {
            if (index > 0)
                hash.update(',');
            updateCanonicalJson(hash, entry);
        });
        hash.update(']');
        return;
    }
    if (typeof value === 'object' && value !== null) {
        hash.update('{');
        Object.keys(value).sort().forEach((key, index) => {
            if (index > 0)
                hash.update(',');
            hash.update(JSON.stringify(key));
            hash.update(':');
            updateCanonicalJson(hash, value[key]);
        });
        hash.update('}');
        return;
    }
    const serialized = JSON.stringify(value);
    hash.update(serialized === undefined ? 'undefined' : serialized);
}
/** Hash deterministic JSON in small chunks so a full report is never duplicated as one large string. */
function hashCanonicalJson(value) {
    const hash = (0, node_crypto_1.createHash)('sha256');
    updateCanonicalJson(hash, value);
    return hash.digest('hex');
}
