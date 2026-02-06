#!/usr/bin/env node
/**
 * Planning Validation Script
 * 
 * Validates .planning/ directory artifacts are complete and consistent.
 * 
 * Checks:
 * - All PLAN.md files have corresponding SUMMARY.md files
 * - STATE.md reflects current progress
 * - Plan tasks are complete before marking as done
 * - No orphaned files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLANNING_DIR = path.join(__dirname, '..', '.planning');
const PHASES_DIR = path.join(PLANNING_DIR, 'phases');

let errors = [];
let warnings = [];

// =============================================================================
// Helper Functions
// =============================================================================

function checkFileExists(filePath) {
  return fs.existsSync(filePath);
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

function listDirectories(dirPath) {
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

function listFiles(dirPath, extension) {
  return fs.readdirSync(dirPath)
    .filter(file => file.endsWith(extension));
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Check that every PLAN.md has a corresponding SUMMARY.md
 */
function validatePlanSummaryPairs() {
  console.log('\n🔍 Checking PLAN.md and SUMMARY.md pairs...');
  
  const phases = listDirectories(PHASES_DIR);
  
  phases.forEach(phase => {
    const phaseDir = path.join(PHASES_DIR, phase);
    const planFiles = listFiles(phaseDir, '-PLAN.md');
    
    planFiles.forEach(planFile => {
      const planId = planFile.replace('-PLAN.md', '');
      const summaryFile = `${planId}-SUMMARY.md`;
      const summaryPath = path.join(phaseDir, summaryFile);
      
      if (!checkFileExists(summaryPath)) {
        warnings.push(`⚠️  Missing SUMMARY for ${phase}/${planFile}`);
        warnings.push(`   Expected: ${phase}/${summaryFile}`);
      }
    });
  });
}

/**
 * Check STATE.md references valid phases
 */
function validateStateReferences() {
  console.log('\n🔍 Validating STATE.md references...');
  
  const statePath = path.join(PLANNING_DIR, 'STATE.md');
  if (!checkFileExists(statePath)) {
    errors.push('❌ STATE.md not found');
    return;
  }
  
  const state = readFile(statePath);
  
  // Extract phase number from "Phase: 15 of 20"
  const phaseMatch = state.match(/Phase:\s*(\d+)\s*of\s*(\d+)/);
  if (!phaseMatch) {
    warnings.push('⚠️  Could not parse current phase from STATE.md');
    return;
  }
  
  const currentPhase = parseInt(phaseMatch[1], 10);
  const totalPhases = parseInt(phaseMatch[2], 10);
  
  console.log(`   Current: Phase ${currentPhase} of ${totalPhases}`);
  
  // Check phase directory exists
  const phases = listDirectories(PHASES_DIR);
  const phasePattern = new RegExp(`^${String(currentPhase).padStart(2, '0')}-`);
  const hasCurrentPhase = phases.some(p => phasePattern.test(p));
  
  if (!hasCurrentPhase) {
    errors.push(`❌ STATE.md references Phase ${currentPhase} but directory not found`);
  }
}

/**
 * Check for orphaned files in phases
 */
function validateNoOrphans() {
  console.log('\n🔍 Checking for orphaned files...');
  
  const phases = listDirectories(PHASES_DIR);
  
  phases.forEach(phase => {
    const phaseDir = path.join(PHASES_DIR, phase);
    const files = fs.readdirSync(phaseDir);
    
    const validPatterns = [
      /^\d{2}-\d{2}-PLAN\.md$/,
      /^\d{2}-\d{2}-SUMMARY\.md$/,
      /^\d{2}-CONTEXT\.md$/,
      /^\d{2}-RESEARCH\.md$/,
      /^\d{2}-VERIFICATION\.md$/,
      /^README\.md$/
    ];
    
    files.forEach(file => {
      const isValid = validPatterns.some(pattern => pattern.test(file));
      if (!isValid) {
        warnings.push(`⚠️  Orphaned file: ${phase}/${file}`);
      }
    });
  });
}

/**
 * Validate PLAN.md structure
 */
function validatePlanStructure() {
  console.log('\n🔍 Validating PLAN.md structure...');
  
  const phases = listDirectories(PHASES_DIR);
  
  phases.forEach(phase => {
    const phaseDir = path.join(PHASES_DIR, phase);
    const planFiles = listFiles(phaseDir, '-PLAN.md');
    
    planFiles.forEach(planFile => {
      const planPath = path.join(phaseDir, planFile);
      const content = readFile(planPath);
      
      // Check for required sections
      const requiredSections = [
        '<objective>',
        '<tasks>',
        '<verification>',
        'must_haves:'
      ];
      
      requiredSections.forEach(section => {
        if (!content.includes(section)) {
          errors.push(`❌ ${phase}/${planFile} missing ${section} section`);
        }
      });
      
      // Check that tasks are defined
      const hasTask = content.match(/<task/);
      if (!hasTask) {
        warnings.push(`⚠️  ${phase}/${planFile} has no tasks defined`);
      }
    });
  });
}

/**
 * Validate required planning files exist
 */
function validateRequiredFiles() {
  console.log('\n🔍 Checking required planning files...');
  
  const required = [
    'PROJECT.md',
    'REQUIREMENTS.md',
    'ROADMAP.md',
    'STATE.md',
    'MILESTONES.md'
  ];
  
  required.forEach(file => {
    const filePath = path.join(PLANNING_DIR, file);
    if (!checkFileExists(filePath)) {
      errors.push(`❌ Required file missing: .planning/${file}`);
    }
  });
}

// =============================================================================
// Main Execution
// =============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 Planning Validation');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (!checkFileExists(PLANNING_DIR)) {
  console.error('\n❌ .planning/ directory not found');
  process.exit(1);
}

validateRequiredFiles();
validateStateReferences();
validatePlanSummaryPairs();
validatePlanStructure();
validateNoOrphans();

// =============================================================================
// Report Results
// =============================================================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Validation Results');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (errors.length > 0) {
  console.log(`\n❌ Errors (${errors.length}):\n`);
  errors.forEach(err => console.log(err));
}

if (warnings.length > 0) {
  console.log(`\n⚠️  Warnings (${warnings.length}):\n`);
  warnings.forEach(warn => console.log(warn));
}

if (errors.length === 0 && warnings.length === 0) {
  console.log('\n✅ All planning artifacts are valid!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  process.exit(0);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Exit with error if there are errors (warnings are non-fatal)
if (errors.length > 0) {
  process.exit(1);
}

process.exit(0);
