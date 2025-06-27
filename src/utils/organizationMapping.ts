export function getOrganizationFilterPattern(user: Express.Request['user']): string {
  if (!user?.organization) {
    return 'unknown-org';
  }

  // Use organization ID or name for mapping
  const orgIdentifier = user.organization.id || user.organization.name;
  
  if (!orgIdentifier) {
    return 'unknown-org';
  }

  const orgLower = orgIdentifier.toLowerCase();

  // Austin Industries mapping
  if (orgLower.includes('austin') || orgLower === 'ai') {
    return 'Austin Industries';
  }

  // QIG mapping - QIG sees all buckets (admin access)
  if (orgLower.includes('qig') || orgLower.includes('quality improvement')) {
    return '*'; // See all buckets
  }

  // Spinakr mapping
  if (orgLower.includes('spinakr') || orgLower.includes('spinaker') || orgLower === 'spnkr') {
    return 'Spinakr';
  }

  // Default: use the organization name as filter pattern
  return user.organization.name || orgIdentifier;
} 