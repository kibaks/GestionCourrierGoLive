// Script pour générer les liens de téléchargement des pilotes selon le fabricant

export function getDriverDownloadLinks(manufacturer, model) {
  const manufacturerLower = (manufacturer || '').toLowerCase();
  const modelLower = (model || '').toLowerCase();
  
  const links = {
    canon: {
      base: 'https://www.canon.fr/support',
      search: (model) => `https://www.canon.fr/support?q=${encodeURIComponent(model)}`,
      common: [
        'https://www.canon.fr/support/consumer_products',
        'https://www.canon.fr/support/business_products'
      ]
    },
    hp: {
      base: 'https://support.hp.com',
      search: (model) => `https://support.hp.com/drivers/${encodeURIComponent(model)}`,
      common: [
        'https://support.hp.com/drivers/scanners',
        'https://support.hp.com/drivers'
      ]
    },
    epson: {
      base: 'https://www.epson.fr/support',
      search: (model) => `https://www.epson.fr/support?q=${encodeURIComponent(model)}`,
      common: [
        'https://www.epson.fr/support/scanners',
        'https://www.epson.fr/support/downloads'
      ]
    },
    brother: {
      base: 'https://www.brother.fr/support',
      search: (model) => `https://www.brother.fr/support?q=${encodeURIComponent(model)}`,
      common: [
        'https://www.brother.fr/support/downloads',
        'https://www.brother.fr/support/scanners'
      ]
    },
    fujitsu: {
      base: 'https://www.fujitsu.com/global/support/products/computing/peripheral/scanners/',
      search: (model) => `https://www.fujitsu.com/global/support/products/computing/peripheral/scanners/?q=${encodeURIComponent(model)}`,
      common: [
        'https://www.fujitsu.com/global/support/products/computing/peripheral/scanners/'
      ]
    },
    kodak: {
      base: 'https://www.kodakalaris.com/support',
      search: (model) => `https://www.kodakalaris.com/support?q=${encodeURIComponent(model)}`,
      common: [
        'https://www.kodakalaris.com/support/scanners'
      ]
    },
    panasonic: {
      base: 'https://www.panasonic.com/fr/support',
      search: (model) => `https://www.panasonic.com/fr/support?q=${encodeURIComponent(model)}`,
      common: [
        'https://www.panasonic.com/fr/support/downloads'
      ]
    }
  };
  
  // Identifier le fabricant
  let manufacturerKey = null;
  for (const key in links) {
    if (manufacturerLower.includes(key) || modelLower.includes(key)) {
      manufacturerKey = key;
      break;
    }
  }
  
  if (!manufacturerKey) {
    // Fabricant non reconnu, retourner des liens génériques
    return {
      manufacturer: manufacturer || 'Unknown',
      model: model || 'Unknown',
      links: [
        {
          type: 'Recherche générique',
          url: `https://www.google.com/search?q=${encodeURIComponent(`${manufacturer} ${model} driver TWAIN download`)}`,
          description: 'Recherche Google pour les pilotes'
        }
      ],
      instructions: 'Recherchez manuellement les pilotes sur le site du fabricant'
    };
  }
  
  const manufacturerLinks = links[manufacturerKey];
  const result = {
    manufacturer: manufacturer,
    model: model,
    links: [
      {
        type: 'Recherche spécifique',
        url: manufacturerLinks.search(model || manufacturer),
        description: `Rechercher "${model || manufacturer}" sur le site ${manufacturer}`
      },
      {
        type: 'Page principale support',
        url: manufacturerLinks.base,
        description: `Page principale du support ${manufacturer}`
      },
      ...manufacturerLinks.common.map((url, index) => ({
        type: `Lien ${index + 1}`,
        url: url,
        description: `Page de téléchargement ${manufacturer}`
      }))
    ],
    instructions: `1. Cliquez sur "Recherche spécifique" pour trouver les pilotes de votre modèle\n2. Ou visitez la page principale du support\n3. Recherchez "TWAIN" ou "ScanGear" (pour Canon) dans les téléchargements`
  };
  
  return result;
}

// Fonction pour générer un lien direct si le modèle est connu
export function getDirectDriverLink(manufacturer, model) {
  const knownModels = {
    canon: {
      'p-215ii': 'https://www.canon.fr/support/product/scanners/imageformula/p-215ii',
      'dr-2020u': 'https://www.canon.fr/support/product/scanners/imageformula/dr-2020u',
      'dr-2080c': 'https://www.canon.fr/support/product/scanners/imageformula/dr-2080c',
      'canoscan': 'https://www.canon.fr/support/consumer_products/products/scanners.html'
    },
    hp: {
      'scanjet': 'https://support.hp.com/drivers/scanners',
      'laserjet': 'https://support.hp.com/drivers/printers'
    }
  };
  
  const manufacturerLower = (manufacturer || '').toLowerCase();
  const modelLower = (model || '').toLowerCase();
  
  if (knownModels[manufacturerLower]) {
    for (const [key, url] of Object.entries(knownModels[manufacturerLower])) {
      if (modelLower.includes(key)) {
        return url;
      }
    }
  }
  
  return null;
}

