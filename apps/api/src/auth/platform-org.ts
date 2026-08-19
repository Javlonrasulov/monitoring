export function platformOrgId() {
  return process.env.PLATFORM_ORG_ID || 'seed-org';
}

export function seesAllOrganizations(organizationId: string) {
  return organizationId === platformOrgId();
}
