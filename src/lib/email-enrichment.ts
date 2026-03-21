export async function findBusinessEmail(
  businessName: string,
  address: string,
  city: string
): Promise<{ email: string | null; source: string | null }> {
  // Try Apollo people search first — free tier, massive database
  try {
    const apolloResponse = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.APOLLO_API_KEY!,
      },
      body: JSON.stringify({
        q_organization_name: businessName,
        q_organization_city: city,
        q_organization_state_code: "TX",
        page: 1,
        per_page: 1,
        contact_email_status: ["verified", "guessed", "unavailable", "bounced", "pending_manual_fulfillment"],
      }),
    });

    const apolloData = await apolloResponse.json();
    const person = apolloData?.people?.[0];

    if (person?.email) {
      return { email: person.email, source: "Apollo" };
    }

    // Try Apollo organization search for domain
    const orgResponse = await fetch("https://api.apollo.io/v1/organizations/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.APOLLO_API_KEY!,
      },
      body: JSON.stringify({
        q_organization_name: businessName,
        q_organization_city: city,
        page: 1,
        per_page: 1,
      }),
    });

    const orgData = await orgResponse.json();
    const org = orgData?.organizations?.[0];

    if (org?.primary_domain) {
      // Use Prospeo domain search for verified email
      const prospeoResponse = await fetch("https://api.prospeo.io/domain-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KEY": process.env.PROSPEO_API_KEY!,
        },
        body: JSON.stringify({
          domain: org.primary_domain,
          limit: 1,
        }),
      });

      const prospeoData = await prospeoResponse.json();
      const prospeoEmail = prospeoData?.response?.emails?.[0]?.email;

      if (prospeoEmail) {
        return { email: prospeoEmail, source: "Prospeo" };
      }
    }
  } catch (error) {
    console.error("[Enrichment] Error:", error);
  }

  return { email: null, source: null };
}
