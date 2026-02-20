/**
 * Hosting Platform Cost Comparison Engine
 *
 * Compares 6 hosting tier options across 5 platforms (Render, Railway, Fly.io, Replit, AWS Lightsail)
 * with budget filtering and 2x growth headroom calculation.
 *
 * Pricing verified as of February 2026.
 */

export interface ResourceRequirements {
  peakRAMMB: number;
  avgCPUPercent: number;  // 0-100
  bandwidthGBPerMonth: number;
  budget: { min: number; max: number };
}

export interface HostingOption {
  platform: string;
  tier: string;
  monthlyCost: number;
  ramMB: number;
  cpuVCPU: number;
  bandwidthIncludedGB: number;
  meetsRequirements: boolean;
  headroom2x: number;  // % capacity remaining if traffic doubles
  websocketSupport: 'native' | 'config-required' | 'limited';
  autoDeployGit: boolean;
  notes: string;
}

export interface CostAnalysis {
  options: HostingOption[];
  withinBudget: HostingOption[];
  recommendation: HostingOption | null;
  recommendationReason: string;
}

/**
 * Platform definition helper
 */
function createOption(
  platform: string,
  tier: string,
  baseCost: number,
  ramMB: number,
  cpuVCPU: number,
  bandwidthIncludedGB: number,
  websocketSupport: 'native' | 'config-required' | 'limited',
  autoDeployGit: boolean,
  notes: string,
  requirements: ResourceRequirements,
  additionalCostFn?: (req: ResourceRequirements) => number
): HostingOption {
  // Calculate total monthly cost (base + usage/bandwidth overages)
  const additionalCost = additionalCostFn ? additionalCostFn(requirements) : 0;
  const monthlyCost = baseCost + additionalCost;

  // Check if platform meets minimum requirements
  const meetsRAM = ramMB >= requirements.peakRAMMB;
  const meetsCPU = cpuVCPU >= (requirements.avgCPUPercent / 100);  // Convert % to vCPU fraction
  const meetsRequirements = meetsRAM && meetsCPU;

  // Calculate headroom for 2x growth
  // What % of resources remain if peakRAM and avgCPU both double
  const ramHeadroom = ((ramMB - requirements.peakRAMMB * 2) / ramMB) * 100;
  const cpuHeadroom = ((cpuVCPU - (requirements.avgCPUPercent * 2 / 100)) / cpuVCPU) * 100;
  const headroom2x = Math.max(0, Math.min(ramHeadroom, cpuHeadroom));

  return {
    platform,
    tier,
    monthlyCost,
    ramMB,
    cpuVCPU,
    bandwidthIncludedGB,
    meetsRequirements,
    headroom2x,
    websocketSupport,
    autoDeployGit,
    notes
  };
}

/**
 * Calculate Railway usage-based pricing
 * Base: $5/mo + compute charges
 * Compute: ~$0.000463/min per vCPU + ~$0.000231/min per 512MB RAM
 * Bandwidth: $0.10/GB egress
 * Assumes 730 hours/month always-on
 */
function calculateRailwayCost(requirements: ResourceRequirements): number {
  const MINUTES_PER_MONTH = 730 * 60;  // 43,800 minutes
  const CPU_COST_PER_MIN_PER_VCPU = 0.000463;
  const RAM_COST_PER_MIN_PER_512MB = 0.000231;
  const BANDWIDTH_COST_PER_GB = 0.10;

  // Convert avgCPU% to fractional vCPU (e.g., 25% = 0.25 vCPU)
  const avgVCPU = requirements.avgCPUPercent / 100;

  // Convert peakRAM to 512MB units (Railway pricing model)
  const ram512MBUnits = requirements.peakRAMMB / 512;

  // Calculate compute costs
  const cpuCost = avgVCPU * CPU_COST_PER_MIN_PER_VCPU * MINUTES_PER_MONTH;
  const ramCost = ram512MBUnits * RAM_COST_PER_MIN_PER_512MB * MINUTES_PER_MONTH;
  const bandwidthCost = requirements.bandwidthGBPerMonth * BANDWIDTH_COST_PER_GB;

  return cpuCost + ramCost + bandwidthCost;
}

/**
 * Calculate Fly.io bandwidth overage
 * 160GB free, then $0.02/GB
 */
function calculateFlyBandwidthCost(requirements: ResourceRequirements): number {
  const FREE_BANDWIDTH_GB = 160;
  const BANDWIDTH_COST_PER_GB = 0.02;

  if (requirements.bandwidthGBPerMonth <= FREE_BANDWIDTH_GB) {
    return 0;
  }

  return (requirements.bandwidthGBPerMonth - FREE_BANDWIDTH_GB) * BANDWIDTH_COST_PER_GB;
}

/**
 * Compare hosting platforms and produce cost analysis with recommendation
 */
export function compareHosting(requirements: ResourceRequirements): CostAnalysis {
  const options: HostingOption[] = [];

  // 1. Render Starter - $7/mo
  options.push(createOption(
    'Render',
    'Starter',
    7,
    512,
    0.5,
    Infinity,  // No bandwidth charges
    'native',
    true,
    'Zero-config deployment, Dockerfile or buildpack, free SSL, sticky sessions built-in',
    requirements
  ));

  // 2. Render Standard - $25/mo
  options.push(createOption(
    'Render',
    'Standard',
    25,
    2048,
    1,
    Infinity,
    'native',
    true,
    'Higher tier for heavier workloads, same perks as Starter',
    requirements
  ));

  // 3. Railway Hobby - $5 base + usage
  options.push(createOption(
    'Railway',
    'Hobby',
    5,
    8192,  // Up to 8GB available
    8,     // Up to 8 vCPU available
    Infinity,  // Bandwidth charged separately at $0.10/GB
    'native',
    true,
    'Usage-based pricing can be cheap or expensive depending on utilization',
    requirements,
    calculateRailwayCost
  ));

  // 4. Fly.io shared-cpu-1x (512MB)
  options.push(createOption(
    'Fly.io',
    'shared-cpu-1x (512MB)',
    3.57,
    512,
    1,  // Shared CPU, roughly 1 vCPU
    160,  // 160GB free bandwidth
    'config-required',
    true,
    'Requires fly.toml config for sticky sessions, global edge deployment',
    requirements,
    calculateFlyBandwidthCost
  ));

  // 5. Fly.io shared-cpu-1x (1GB)
  options.push(createOption(
    'Fly.io',
    'shared-cpu-1x (1GB)',
    7.12,
    1024,
    1,
    160,
    'config-required',
    true,
    'Higher RAM tier, good for global deployment',
    requirements,
    calculateFlyBandwidthCost
  ));

  // 6. Replit Core - $25/mo (current hosting)
  options.push(createOption(
    'Replit',
    'Core',
    25,
    8192,  // ~8GB available
    4,
    Infinity,  // No explicit bandwidth limits
    'native',
    true,
    'Currently used; expensive relative to alternatives for this workload',
    requirements
  ));

  // 7. AWS Lightsail $3.50 tier
  options.push(createOption(
    'AWS Lightsail',
    '$3.50 tier',
    3.50,
    512,
    1,
    1024,  // 1TB = 1024GB
    'config-required',
    false,
    'Cheapest raw compute, manual nginx/Node setup, Let\'s Encrypt SSL manual, no auto-deploy',
    requirements
  ));

  // 8. AWS Lightsail $5 tier
  options.push(createOption(
    'AWS Lightsail',
    '$5 tier',
    5,
    1024,
    1,
    2048,  // 2TB
    'config-required',
    false,
    'More RAM headroom, still manual setup required',
    requirements
  ));

  // 9. AWS Lightsail $10 tier
  options.push(createOption(
    'AWS Lightsail',
    '$10 tier',
    10,
    2048,
    1,
    3072,  // 3TB
    'config-required',
    false,
    'Highest RAM tier in budget range, manual operations overhead',
    requirements
  ));

  // Sort by monthly cost ascending
  options.sort((a, b) => a.monthlyCost - b.monthlyCost);

  // Filter to options within budget
  const withinBudget = options.filter(
    opt => opt.monthlyCost >= requirements.budget.min &&
           opt.monthlyCost <= requirements.budget.max
  );

  // Find best recommendation
  // Criteria: meetsRequirements, has 2x headroom (>= 0%), within budget
  // Prefer: cheapest, then native WebSocket, then Git auto-deploy
  const candidates = withinBudget.filter(
    opt => opt.meetsRequirements && opt.headroom2x >= 0
  );

  // Sort candidates by preference
  candidates.sort((a, b) => {
    // 1. Cheapest first
    if (a.monthlyCost !== b.monthlyCost) {
      return a.monthlyCost - b.monthlyCost;
    }
    // 2. Native WebSocket preferred
    if (a.websocketSupport === 'native' && b.websocketSupport !== 'native') {
      return -1;
    }
    if (a.websocketSupport !== 'native' && b.websocketSupport === 'native') {
      return 1;
    }
    // 3. Git auto-deploy preferred
    if (a.autoDeployGit && !b.autoDeployGit) {
      return -1;
    }
    if (!a.autoDeployGit && b.autoDeployGit) {
      return 1;
    }
    return 0;
  });

  const recommendation = candidates.length > 0 ? candidates[0] : null;

  let recommendationReason = '';
  if (recommendation) {
    const headroomText = recommendation.headroom2x.toFixed(0);
    const wsText = recommendation.websocketSupport === 'native'
      ? 'native WebSocket support'
      : 'WebSocket support (config required)';
    const deployText = recommendation.autoDeployGit
      ? 'zero-config Git deployment'
      : 'manual deployment setup';

    recommendationReason = `${recommendation.platform} ${recommendation.tier} at $${recommendation.monthlyCost.toFixed(2)}/mo provides ${recommendation.ramMB}MB RAM with ${headroomText}% headroom for 2x growth, ${wsText}, and ${deployText}.`;
  } else {
    if (withinBudget.length === 0) {
      recommendationReason = 'No options available within budget range.';
    } else if (withinBudget.filter(opt => opt.meetsRequirements).length === 0) {
      recommendationReason = 'No options within budget meet minimum resource requirements.';
    } else {
      recommendationReason = 'No options within budget can handle 2x traffic growth. Consider increasing budget or optimizing resource usage.';
    }
  }

  return {
    options,
    withinBudget,
    recommendation,
    recommendationReason
  };
}
