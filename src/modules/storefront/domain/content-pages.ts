export type StorefrontContentPage = {
  description: string;
  sections: readonly { body: string; heading: string }[];
  title: string;
};

export const storefrontContentPages = {
  about: {
    description: "How ParcelMint approaches dependable cash-on-delivery commerce.",
    title: "About ParcelMint",
    sections: [
      {
        heading: "Clear from the start",
        body: "ParcelMint is designed to show product pricing, variant availability, and delivery expectations before an order is submitted.",
      },
      {
        heading: "Accountable operations",
        body: "Catalog changes and inventory movements are recorded so the storefront can present dependable product information.",
      },
    ],
  },
  contact: {
    description: "How to contact ParcelMint support.",
    title: "Contact",
    sections: [
      {
        heading: "Support details",
        body: "Verified support channels will be published here before launch. Do not send payment credentials or identity documents through unverified channels.",
      },
    ],
  },
  faq: {
    description: "Common questions about shopping with ParcelMint.",
    title: "Frequently asked questions",
    sections: [
      {
        heading: "Do I need an account?",
        body: "No. Guest cash-on-delivery checkout is part of the purchasing experience.",
      },
      {
        heading: "When is the final total confirmed?",
        body: "Product prices, availability, and delivery charges are recalculated by the server before an order is created.",
      },
      {
        heading: "Can stock change?",
        body: "Yes. Availability is checked again during checkout because another customer may purchase the last unit.",
      },
    ],
  },
  shipping: {
    description: "ParcelMint shipping and delivery information.",
    title: "Shipping information",
    sections: [
      {
        heading: "Before you order",
        body: "Supported delivery areas, available services, charges, and estimates will be shown during checkout. Final rules depend on the confirmed delivery address and approved courier configuration.",
      },
    ],
  },
  returns: {
    description: "ParcelMint return information.",
    title: "Returns",
    sections: [
      {
        heading: "Eligibility",
        body: "Return eligibility, timing, inspection, and disposition rules will be displayed before launch after the business policy is approved. Keep the product and delivery records until a request is resolved.",
      },
    ],
  },
  privacy: {
    description: "How ParcelMint handles customer information.",
    title: "Privacy",
    sections: [
      {
        heading: "Data minimization",
        body: "ParcelMint is designed to collect only the information needed for shopping, fulfillment, support, security, and applicable legal obligations. The final jurisdiction-specific notice will be reviewed before launch.",
      },
    ],
  },
  terms: {
    description: "Terms for using ParcelMint.",
    title: "Terms",
    sections: [
      {
        heading: "Pre-launch notice",
        body: "Final commercial terms, cash-on-delivery rules, cancellation rules, and applicable legal terms require business and professional approval before launch.",
      },
    ],
  },
} as const satisfies Record<string, StorefrontContentPage>;

export type StorefrontContentSlug = keyof typeof storefrontContentPages;
