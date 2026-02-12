
import path from "node:path";

console.log("Starting Audit Verification...");

let failures = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    failures++;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Skill ID Validation (from src/api/server.ts)
// ---------------------------------------------------------------------------
console.log("\n--- validating Skill ID (Path Traversal) ---");
const SAFE_SKILL_ID_RE = /^[a-zA-Z0-9._-]+$/;

function validateSkillId(skillId: string): boolean {
  if (
    !skillId ||
    !SAFE_SKILL_ID_RE.test(skillId) ||
    skillId === "." ||
    skillId.includes("..")
  ) {
    return false;
  }
  return true;
}

assert(validateSkillId("my-skill"), "Valid skill ID allowed");
assert(validateSkillId("my_skill.123"), "Valid skill ID with dots/underscores allowed");
assert(!validateSkillId("../bad"), "Parent directory traversal blocked");
assert(!validateSkillId("bad/skill"), "Slash blocked");
assert(!validateSkillId("skill..name"), "Double dot blocked");
assert(!validateSkillId("."), "Dot blocked");
assert(!validateSkillId(""), "Empty string blocked");
assert(!validateSkillId("skill name"), "Space blocked");
assert(!validateSkillId("skill;rm -rf /"), "Shell char blocked");

// ---------------------------------------------------------------------------
// 2. Plugin Installer Validation (from src/services/plugin-installer.ts)
// ---------------------------------------------------------------------------
console.log("\n--- validating Plugin Installer Regex (Shell Injection) ---");

const VALID_PACKAGE_NAME = /^(@[a-zA-Z0-9][\w.-]*\/)?[a-zA-Z0-9][\w.-]*$/;
const VALID_VERSION = /^[a-zA-Z0-9][\w.+-]*$/;
const VALID_BRANCH = /^[a-zA-Z0-9][\w./-]*$/;
const VALID_GIT_URL = /^https:\/\/[a-zA-Z0-9][\w./-]*\.git$/;

// Package Name
assert(VALID_PACKAGE_NAME.test("react"), "Valid package name allowed");
assert(VALID_PACKAGE_NAME.test("@scope/pkg"), "Valid scoped package allowed");
assert(VALID_PACKAGE_NAME.test("pkg-name.js"), "Dots allowed");
assert(!VALID_PACKAGE_NAME.test("pkg; rm -rf /"), "Semicolon blocked");
assert(!VALID_PACKAGE_NAME.test("pkg$(whoami)"), "Command substitution blocked");
assert(!VALID_PACKAGE_NAME.test("pkg>output"), "Redirection blocked");
assert(!VALID_PACKAGE_NAME.test("../pkg"), "Path traversal blocked");

// Version
assert(VALID_VERSION.test("1.0.0"), "Valid version allowed");
assert(VALID_VERSION.test("1.0.0-beta.1+build"), "Semver extended allowed");
assert(VALID_VERSION.test("latest"), "Tag allowed");
assert(!VALID_VERSION.test("1.0.0; rm -rf /"), "Semicolon blocked");

// Branch
assert(VALID_BRANCH.test("main"), "Valid branch allowed");
assert(VALID_BRANCH.test("feature/my-branch"), "Slash allowed");
assert(!VALID_BRANCH.test("main; echo pwned"), "Semicolon blocked");

// Git URL
assert(VALID_GIT_URL.test("https://github.com/user/repo.git"), "Valid git URL allowed");
assert(!VALID_GIT_URL.test("http://github.com/user/repo.git"), "HTTP blocked (must be HTTPS)");
assert(!VALID_GIT_URL.test("git@github.com:user/repo.git"), "SSH blocked");
assert(!VALID_GIT_URL.test("https://github.com/user/repo.git; rm -rf /"), "Semicolon blocked");

// ---------------------------------------------------------------------------
// 3. Skill Marketplace Path Sanitization (from src/services/skill-marketplace.ts)
// ---------------------------------------------------------------------------
console.log("\n--- validating Skill Path Sanitization ---");

function sanitizeSkillPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Invalid skill path");
  if (trimmed.startsWith("~")) throw new Error("Invalid skill path");
  if (path.posix.isAbsolute(trimmed) || path.win32.isAbsolute(trimmed)) {
    throw new Error("Invalid skill path");
  }
  if (trimmed.includes("\\")) throw new Error("Invalid skill path");
  const cleaned = trimmed.replace(/^\/+/, "");
  if (!cleaned) throw new Error("Invalid skill path");
  // Re-check absolute after cleaning (just in case)
  if (path.posix.isAbsolute(cleaned) || path.win32.isAbsolute(cleaned)) {
    throw new Error("Invalid skill path");
  }
  if (cleaned === ".") return ".";
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length === 0) throw new Error("Invalid skill path");
  if (parts.some((p) => p === "." || p === "..")) {
    throw new Error("Invalid skill path");
  }
  return parts.join("/");
}

try {
  assert(sanitizeSkillPath("skills/my-skill") === "skills/my-skill", "Valid path allowed");
  assert(sanitizeSkillPath("./skills/my-skill") === "skills/my-skill", "Leading ./ removed");
} catch (e) {
  assert(false, `Valid path threw error: ${e}`);
}

try {
  sanitizeSkillPath("../secrets");
  assert(false, "Parent traversal should throw");
} catch {
  assert(true, "Parent traversal threw error");
}

try {
  sanitizeSkillPath("/etc/passwd");
  assert(false, "Absolute path should throw");
} catch {
  assert(true, "Absolute path threw error");
}

try {
  sanitizeSkillPath("skills/../../secrets");
  assert(false, "Nested traversal should throw");
} catch {
  assert(true, "Nested traversal threw error");
}

// ---------------------------------------------------------------------------
// 4. Repo Normalization (from src/services/skill-marketplace.ts)
// ---------------------------------------------------------------------------
console.log("\n--- validating Repo Normalization ---");

function normalizeRepo(raw: string): string {
  const repo = raw
    .replace(/^https:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^github:/i, "")
    .trim();
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo)) {
    throw new Error(`Invalid repository: ${raw}`);
  }
  return repo;
}

try {
  assert(normalizeRepo("owner/repo") === "owner/repo", "Standard repo allowed");
  assert(normalizeRepo("https://github.com/owner/repo.git") === "owner/repo", "URL normalized");
  assert(normalizeRepo("github:owner/repo") === "owner/repo", "Prefix normalized");
} catch (e) {
  assert(false, `Valid repo threw error: ${e}`);
}

try {
  normalizeRepo("owner/repo; rm -rf /");
  assert(false, "Shell injection in repo should throw");
} catch {
  assert(true, "Shell injection in repo threw error");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("\n---------------------------------------------------");
if (failures === 0) {
  console.log("ALL CHECKS PASSED. Logic appears robust.");
  process.exit(0);
} else {
  console.error(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
