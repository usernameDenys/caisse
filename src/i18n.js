const lang = document.documentElement.lang || "fr";

const translations = {
  fr: {
    hotspots: [
      {
        id: "conveyor",
        label: "Tapis convoyeur",
        title: "Bande transporteuse",
        content:
          "Bande caoutchouc avec réglage par vis avant. Marche avant ou arrière, possibilité de commande pédale.",
      },
      {
        id: "motor",
        label: "Motorisation",
        title: "Moteur 220 V EU",
        content:
          "Moteur monophasé 220 V normes EU. Boîtier de commande avec fonction lanterneau 2 couleurs.",
      },
      {
        id: "bac",
        label: "Bac arrière",
        title: "Bac inox",
        content:
          "Bac arrière en inox pour nettoyage rapide et évacuation rapide des articles.",
      },
      {
        id: "protection",
        label: "Protection caissier",
        title: "Écran de protection",
        content:
          "Protection du personnel en plexiglas transparent. Fixation rigide sur la base de la caisse pour une stabilité optimale.",
      },
    ],
    devis: {
      labels: {
        product: "Produit",
        productValue: "Caisse Standard",
        mirror: "Sens de caisse",
        belt: "Tapis",
        tray: "Module Bac",
        color: "Couleur",
        light: "Éclairage intérieur",
        custom: "Personnalisé",
      },
      email: {
        subject: "Demande de devis — Caisse Standard",
        greeting: "Bonjour,",
        intro: "Je souhaite recevoir un devis pour la configuration suivante :",
        closing: "Cordialement,",
      },
    },
  },
  en: {
    hotspots: [
      {
        id: "conveyor",
        label: "Conveyor belt",
        title: "Transport belt",
        content:
          "Rubber belt with front screw adjustment. Forward or reverse operation, optional pedal control.",
      },
      {
        id: "motor",
        label: "Motor",
        title: "220 V EU Motor",
        content:
          "Single-phase 220 V EU standard motor. Control unit with 2-colour lantern function.",
      },
      {
        id: "bac",
        label: "Rear tray",
        title: "Stainless steel tray",
        content:
          "Stainless steel rear tray for quick cleaning and rapid item evacuation.",
      },
      {
        id: "protection",
        label: "Cashier protection",
        title: "Protection screen",
        content:
          "Transparent plexiglass staff protection. Rigid mounting on the checkout base for optimal stability.",
      },
    ],
    devis: {
      labels: {
        product: "Product",
        productValue: "Standard Checkout",
        mirror: "Orientation",
        belt: "Belt",
        tray: "Tray module",
        color: "Colour",
        light: "Interior lighting",
        custom: "Custom",
      },
      email: {
        subject: "Quote request — Standard Checkout",
        greeting: "Hello,",
        intro:
          "I would like to receive a quote for the following configuration:",
        closing: "Kind regards,",
      },
    },
  },
};

export const t = translations[lang] || translations.fr;
