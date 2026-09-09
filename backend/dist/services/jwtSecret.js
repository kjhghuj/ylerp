"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJwtSecret = getJwtSecret;
exports.assertJwtSecretConfigured = assertJwtSecretConfigured;
const DOCUMENTED_PLACEHOLDER = 'change-me-to-a-random-string-at-least-32-chars';
const LEGACY_PUBLIC_SECRET = 'yangling-erp-secret-key-2026';
const TEST_ONLY_SECRET = 'test-only-jwt-secret-never-use-outside-tests';
function getJwtSecret() {
    const configured = process.env.JWT_SECRET?.trim();
    if (configured && configured.length >= 32 && ![DOCUMENTED_PLACEHOLDER, LEGACY_PUBLIC_SECRET].includes(configured)) {
        return configured;
    }
    if (process.env.NODE_ENV === 'test')
        return TEST_ONLY_SECRET;
    throw new Error('JWT_SECRET must be configured with a private value of at least 32 characters');
}
function assertJwtSecretConfigured() {
    getJwtSecret();
}
