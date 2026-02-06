#!/usr/bin/env node
/**
 * Contract Compliance Validator
 * 
 * Validates that API implementation matches OpenAPI/AsyncAPI specs.
 * Prevents spec drift by enforcing type consistency.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

let warnings = 0;
let errors = 0;

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  errors++;
  log(`❌ ERROR: ${message}`, 'red');
}

function warn(message) {
  warnings++;
  log(`⚠️  WARNING: ${message}`, 'yellow');
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function info(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

/**
 * Check if generated types exist and are recent
 */
function checkGeneratedTypes() {
  const typesFile = path.join(ROOT, 'shared/api-types.generated.ts');
  const specFile = path.join(ROOT, 'specs/openapi.yaml');
  
  if (!fs.existsSync(typesFile)) {
    error('API types not generated: shared/api-types.generated.ts missing');
    info('Run: npm run generate:api-types');
    return false;
  }
  
  const typesStat = fs.statSync(typesFile);
  const specStat = fs.statSync(specFile);
  
  if (specStat.mtime > typesStat.mtime) {
    warn('API types are stale (spec modified after types generated)');
    info('Run: npm run generate:api-types');
    return false;
  }
  
  success('API types are up to date');
  return true;
}

/**
 * Validate OpenAPI spec structure
 */
function validateOpenAPISpec() {
  const specPath = path.join(ROOT, 'specs/openapi.yaml');
  
  if (!fs.existsSync(specPath)) {
    error('OpenAPI spec not found: specs/openapi.yaml');
    return false;
  }
  
  try {
    const content = fs.readFileSync(specPath, 'utf8');
    const spec = YAML.parse(content);
    
    // Basic structure checks
    if (!spec.openapi) {
      error('OpenAPI spec missing "openapi" field');
      return false;
    }
    
    if (!spec.info || !spec.info.title || !spec.info.version) {
      error('OpenAPI spec missing required info fields');
      return false;
    }
    
    if (!spec.paths || Object.keys(spec.paths).length === 0) {
      warn('OpenAPI spec has no paths defined');
    }
    
    success(`OpenAPI spec valid (${Object.keys(spec.paths || {}).length} endpoints)`);
    return true;
  } catch (err) {
    error(`OpenAPI spec parse error: ${err.message}`);
    return false;
  }
}

/**
 * Validate AsyncAPI spec structure
 */
function validateAsyncAPISpec() {
  const specPath = path.join(ROOT, 'specs/asyncapi.yaml');
  
  if (!fs.existsSync(specPath)) {
    error('AsyncAPI spec not found: specs/asyncapi.yaml');
    return false;
  }
  
  try {
    const content = fs.readFileSync(specPath, 'utf8');
    const spec = YAML.parse(content);
    
    // Basic structure checks
    if (!spec.asyncapi) {
      error('AsyncAPI spec missing "asyncapi" field');
      return false;
    }
    
    if (!spec.info || !spec.info.title || !spec.info.version) {
      error('AsyncAPI spec missing required info fields');
      return false;
    }
    
    if (!spec.channels || Object.keys(spec.channels).length === 0) {
      warn('AsyncAPI spec has no channels defined');
    }
    
    success(`AsyncAPI spec valid (${Object.keys(spec.channels || {}).length} channels)`);
    return true;
  } catch (err) {
    error(`AsyncAPI spec parse error: ${err.message}`);
    return false;
  }
}

/**
 * Check that shared/gameEvents.ts types align with AsyncAPI spec
 */
function checkWebSocketTypeAlignment() {
  const gameEventsPath = path.join(ROOT, 'shared/gameEvents.ts');
  const asyncAPIPath = path.join(ROOT, 'specs/asyncapi.yaml');
  
  if (!fs.existsSync(gameEventsPath)) {
    warn('shared/gameEvents.ts not found - cannot verify WS type alignment');
    return false;
  }
  
  if (!fs.existsSync(asyncAPIPath)) {
    warn('specs/asyncapi.yaml not found - cannot verify WS type alignment');
    return false;
  }
  
  // Read gameEvents.ts and extract event names
  const gameEventsContent = fs.readFileSync(gameEventsPath, 'utf8');
  const clientToServerMatch = gameEventsContent.match(/interface\s+ClientToServerEvents\s*{([^}]+)}/s);
  const serverToClientMatch = gameEventsContent.match(/interface\s+ServerToClientEvents\s*{([^}]+)}/s);
  
  if (!clientToServerMatch || !serverToClientMatch) {
    warn('Could not parse ClientToServerEvents or ServerToClientEvents interfaces');
    return false;
  }
  
  // Extract event names from interfaces
  const c2sEvents = [...clientToServerMatch[1].matchAll(/(\w+)\s*:/g)].map(m => m[1]);
  const s2cEvents = [...serverToClientMatch[1].matchAll(/(\w+)\s*:/g)].map(m => m[1]);
  
  info(`Found ${c2sEvents.length} client→server events, ${s2cEvents.length} server→client events`);
  
  // Read AsyncAPI spec and extract message names
  const asyncAPIContent = fs.readFileSync(asyncAPIPath, 'utf8');
  const spec = YAML.parse(asyncAPIContent);
  
  if (!spec.channels || !spec.channels.clientToServer || !spec.channels.serverToClient) {
    warn('AsyncAPI spec missing clientToServer or serverToClient channels');
    return false;
  }
  
  const specC2S = Object.keys(spec.channels.clientToServer.messages || {});
  const specS2C = Object.keys(spec.channels.serverToClient.messages || {});
  
  // Compare event names
  const missingInSpec = [
    ...c2sEvents.filter(e => !specC2S.includes(e)).map(e => `client→server: ${e}`),
    ...s2cEvents.filter(e => !specS2C.includes(e)).map(e => `server→client: ${e}`)
  ];
  
  const missingInCode = [
    ...specC2S.filter(e => !c2sEvents.includes(e)).map(e => `client→server: ${e}`),
    ...specS2C.filter(e => !s2cEvents.includes(e)).map(e => `server→client: ${e}`)
  ];
  
  if (missingInSpec.length > 0) {
    warn(`Events in code but not in AsyncAPI spec:\n  ${missingInSpec.join('\n  ')}`);
  }
  
  if (missingInCode.length > 0) {
    warn(`Events in AsyncAPI spec but not in code:\n  ${missingInCode.join('\n  ')}`);
  }
  
  if (missingInSpec.length === 0 && missingInCode.length === 0) {
    success('WebSocket event types aligned with AsyncAPI spec');
    return true;
  }
  
  return false;
}

/**
 * Main validation
 */
function main() {
  log('\n🔍 Validating Contract Compliance...\n', 'cyan');
  
  const checks = [
    { name: 'OpenAPI Spec', fn: validateOpenAPISpec },
    { name: 'AsyncAPI Spec', fn: validateAsyncAPISpec },
    { name: 'Generated Types', fn: checkGeneratedTypes },
    { name: 'WebSocket Type Alignment', fn: checkWebSocketTypeAlignment }
  ];
  
  let passed = 0;
  checks.forEach(check => {
    log(`\n${check.name}:`, 'dim');
    if (check.fn()) {
      passed++;
    }
  });
  
  // Summary
  log('\n' + '='.repeat(60), 'dim');
  log(`\n📊 Summary: ${passed}/${checks.length} checks passed`, 'cyan');
  
  if (errors > 0) {
    log(`   ${errors} errors`, 'red');
  }
  if (warnings > 0) {
    log(`   ${warnings} warnings`, 'yellow');
  }
  
  log(''); // blank line
  
  // Exit codes
  if (errors > 0) {
    log('❌ Contract compliance validation FAILED\n', 'red');
    process.exit(1);
  } else if (warnings > 0) {
    log('⚠️  Contract compliance validation passed with warnings\n', 'yellow');
    process.exit(0);
  } else {
    log('✅ Contract compliance validation PASSED\n', 'green');
    process.exit(0);
  }
}

main();
