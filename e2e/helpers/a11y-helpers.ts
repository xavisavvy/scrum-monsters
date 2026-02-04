import type { Result } from 'axe-core';

/**
 * Violation fingerprint for baseline comparison.
 * Per RESEARCH.md Pattern 2: Use minimal identifying info to avoid brittle snapshots.
 */
export type ViolationFingerprint = {
  rule: string;
  targets: string[][];
};

/**
 * Convert violations to fingerprints for baseline comparison.
 */
export function fingerprintViolations(violations: Result[]): ViolationFingerprint[] {
  return violations.map(violation => ({
    rule: violation.id,
    targets: violation.nodes.map(node => node.target as string[])
  }));
}

/**
 * Filter violations by blocking impact levels (critical, serious).
 * Per CONTEXT.md: Level A + critical/serious impact blocks merge.
 */
export function filterBlockingViolations(violations: Result[]): Result[] {
  return violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
}

/**
 * Filter violations by warning impact levels (moderate, minor).
 * Per CONTEXT.md: Moderate/minor reported but don't block merge.
 */
export function filterWarningViolations(violations: Result[]): Result[] {
  return violations.filter(
    v => v.impact === 'moderate' || v.impact === 'minor'
  );
}

/**
 * Format a violation for human-readable output.
 * Includes all info per CONTEXT.md: element selector, WCAG rule, impact, fix suggestion, help URL.
 */
export function formatViolation(violation: Result): string {
  const lines = [
    `[${violation.impact?.toUpperCase()}] ${violation.id}`,
    `  Rule: ${violation.help}`,
    `  Description: ${violation.description}`,
    `  Help: ${violation.helpUrl}`,
    `  Affected elements:`
  ];

  for (const node of violation.nodes) {
    lines.push(`    - ${node.target.join(' > ')}`);
    if (node.failureSummary) {
      lines.push(`      Fix: ${node.failureSummary.split('\n')[0]}`);
    }
  }

  return lines.join('\n');
}

/**
 * Log non-blocking violations as warnings.
 */
export function logWarningViolations(violations: Result[]): void {
  const warnings = filterWarningViolations(violations);
  if (warnings.length > 0) {
    console.warn(`\n⚠️  ${warnings.length} non-blocking accessibility warning(s):\n`);
    warnings.forEach(v => console.warn(formatViolation(v) + '\n'));
  }
}
