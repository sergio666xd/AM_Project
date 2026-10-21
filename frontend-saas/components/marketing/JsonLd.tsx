import { SITE_URL } from "@/lib/siteUrl";

interface JsonLdProps {
  schema?: Record<string, unknown>;
}

export function JsonLd({ schema }: JsonLdProps) {
  const defaultLegalServiceSchema = {
    "@context": "https://schema.org",
    "@type": "LegalService",
    "@id": `${SITE_URL}/#organization`,
    name: "Alejandra Muñoz | Abogada y Asociados",
    alternateName: "Alejandra Muñoz Abogada",
    url: SITE_URL,
    logo: `${SITE_URL}/AM_logo_Recurso%202_Landscape_web.svg`,
    image: `${SITE_URL}/AM_logo_Recurso%202_Landscape_web.svg`,
    description:
      "Firma jurídica especializada en derecho civil, familia, sucesiones, contratos, propiedad horizontal y pólizas jurídicas preventivas en Sabaneta, Antioquia y Colombia.",
    telephone: "+573508809878",
    email: "alejandramunozabg@outlook.com",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Sabaneta",
      addressRegion: "Antioquia",
      addressCountry: "CO",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 6.1517,
      longitude: -75.6158,
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
        ],
        opens: "08:00",
        closes: "17:00",
      },
    ],
    areaServed: [
      { "@type": "City", name: "Sabaneta" },
      { "@type": "City", name: "Medellín" },
      { "@type": "City", name: "Envigado" },
      { "@type": "City", name: "Itagüí" },
      { "@type": "Country", name: "Colombia" },
    ],
    priceRange: "$$",
    founder: {
      "@type": "Person",
      name: "Yeinny Alejandra Muñoz Marín",
      jobTitle: "Abogada Titular",
      hasCredential: {
        "@type": "EducationalOccupationalCredential",
        credentialCategory: "Tarjeta Profesional",
        name: "Tarjeta Profesional No. 375.092 C.S. de la J.",
      },
    },
  };

  const finalSchema = schema || defaultLegalServiceSchema;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(finalSchema) }}
    />
  );
}

