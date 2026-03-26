require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

const app = express();
const PORT = 3002;

console.log("THIS IS THE BACKEND 3002 FILE");
console.log("RUNNING SERVER.JS FILE CUSTOMER REPORT VERSION");
console.log("SERVER_JS_BOOTED");

function getCorrectedYear(vin, row){
  let year = row.ModelYear || "";

  const yearMap = {
    A: 2010, B: 2011, C: 2012, D: 2013, E: 2014,
    F: 2015, G: 2016, H: 2017, J: 2018, K: 2019,
    L: 2020, M: 2021, N: 2022, P: 2023, R: 2024,
    S: 2025, T: 2026, V: 2027, W: 2028, X: 2029,
    Y: 2030,
    1: 2001, 2: 2002, 3: 2003, 4: 2004, 5: 2005,
    6: 2006, 7: 2007, 8: 2008, 9: 2009
  };

  const vinYearCode = vin.charAt(9);
  const decodedYear = yearMap[vinYearCode];

  if (!year && decodedYear) return decodedYear;

  if (decodedYear && year && Math.abs(decodedYear - year) > 1){
    return decodedYear;
  }

  return year;
}

function normalizeVehicleText(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function matchesEngineRule(vehicle, match) {
  const model = normalizeVehicleText(vehicle.model);
  const trim = normalizeVehicleText(vehicle.trim);
  const engine = normalizeVehicleText(vehicle.engine);
  const make = normalizeVehicleText(vehicle.make);
  const year = Number(vehicle.year || 0);

  if (match.make && normalizeVehicleText(match.make) !== make) {
    return false;
  }

  if (match.yearMin && year < match.yearMin) {
    return false;
  }

  if (match.yearMax && year > match.yearMax) {
    return false;
  }

  if (match.modelIncludes && !match.modelIncludes.some(item => model.includes(normalizeVehicleText(item)))) {
    return false;
  }

  if (match.trimIncludes && !match.trimIncludes.some(item => trim.includes(normalizeVehicleText(item)))) {
    return false;
  }

  if (match.engineIncludes && !match.engineIncludes.some(item => engine.includes(normalizeVehicleText(item)))) {
    return false;
  }

  return true;
}

const ENGINE_RULES = [
  {
    match: {
      make: "BMW",
      modelIncludes: ["330I"],
      yearMin: 2019
    },
    result: {
      enginePlatform: "B48",
      engineConfidence: "High",
      engineSummary: "This vehicle profile strongly points to the B48 engine platform."
    }
  },
  {
    match: {
      make: "BMW",
      modelIncludes: ["320I"],
      yearMax: 2016
    },
    result: {
      enginePlatform: "N20 or B48",
      engineConfidence: "Moderate",
      engineSummary: "This model year can sit near a transition point, so exact engine confirmation is sensible."
    }
  },
  {
    match: {
      make: "BMW",
      modelIncludes: ["340I"]
    },
    result: {
      enginePlatform: "B58",
      engineConfidence: "High",
      engineSummary: "This vehicle profile strongly points to the B58 engine platform."
    }
  },
  {
    match: {
      make: "BMW",
      modelIncludes: ["M340I"]
    },
    result: {
      enginePlatform: "B58",
      engineConfidence: "High",
      engineSummary: "This vehicle profile strongly points to the B58 engine platform."
    }
  },
  {
    match: {
      make: "BMW",
      modelIncludes: ["M3"],
      yearMax: 2020
    },
    result: {
      enginePlatform: "S55",
      engineConfidence: "Moderate",
      engineSummary: "This M3 profile commonly aligns with the S55 platform, though exact year and market should still be confirmed."
    }
  },
  {
    match: {
      make: "BMW",
      modelIncludes: ["M3"],
      yearMin: 2021
    },
    result: {
      enginePlatform: "S58",
      engineConfidence: "Moderate",
      engineSummary: "This M3 profile commonly aligns with the S58 platform, though exact year and market should still be confirmed."
    }
  },
  {
    match: {
      make: "AUDI",
      modelIncludes: ["A3", "A4", "A5", "Q3", "Q5"],
      engineIncludes: ["2.0"]
    },
    result: {
      enginePlatform: "EA888",
      engineConfidence: "High",
      engineSummary: "This Audi profile strongly points to the EA888 turbocharged four cylinder platform."
    }
  },
  {
    match: {
      make: "AUDI",
      modelIncludes: ["S3", "TTS"],
      engineIncludes: ["2.0"]
    },
    result: {
      enginePlatform: "EA888 High Output",
      engineConfidence: "Moderate",
      engineSummary: "This Audi performance four cylinder profile commonly aligns with a higher output EA888 variant."
    }
  },
  {
    match: {
      make: "AUDI",
      modelIncludes: ["S4", "S5", "SQ5"]
    },
    result: {
      enginePlatform: "3.0T V6",
      engineConfidence: "Moderate",
      engineSummary: "This Audi profile commonly aligns with a turbocharged 3.0 liter V6 performance platform."
    }
  },
  {
    match: {
      make: "VOLKSWAGEN",
      modelIncludes: ["GTI", "GLI", "GOLF R", "ARTEON"],
      engineIncludes: ["2.0"]
    },
    result: {
      enginePlatform: "EA888",
      engineConfidence: "High",
      engineSummary: "This Volkswagen profile strongly points to the EA888 turbocharged four cylinder platform."
    }
  },
  {
    match: {
      make: "VOLKSWAGEN",
      modelIncludes: ["JETTA", "PASSAT", "TIGUAN"],
      engineIncludes: ["1.8", "2.0"]
    },
    result: {
      enginePlatform: "EA888 or EA211",
      engineConfidence: "Moderate",
      engineSummary: "This Volkswagen profile commonly aligns with modern VW turbocharged gasoline engine families, but exact displacement and year should still be confirmed."
    }
  },
  {
    match: {
      make: "FORD",
      modelIncludes: ["F-150", "F150"],
      engineIncludes: ["2.7"]
    },
    result: {
      enginePlatform: "2.7 EcoBoost",
      engineConfidence: "High",
      engineSummary: "This Ford truck profile strongly points to the 2.7 EcoBoost platform."
    }
  },
  {
    match: {
      make: "FORD",
      modelIncludes: ["F-150", "F150"],
      engineIncludes: ["3.5"]
    },
    result: {
      enginePlatform: "3.5 EcoBoost or 3.5 V6",
      engineConfidence: "Moderate",
      engineSummary: "This Ford truck profile commonly aligns with the 3.5 EcoBoost family, though exact configuration should still be confirmed."
    }
  },
  {
    match: {
      make: "FORD",
      modelIncludes: ["ESCAPE", "EDGE", "EXPLORER", "MUSTANG"],
      engineIncludes: ["2.0", "2.3"]
    },
    result: {
      enginePlatform: "EcoBoost",
      engineConfidence: "Moderate",
      engineSummary: "This Ford profile commonly aligns with the EcoBoost engine family."
    }
  },
  {
    match: {
      make: "CHEVROLET",
      modelIncludes: ["SILVERADO", "TAHOE", "SUBURBAN", "CAMARO", "CORVETTE"],
      engineIncludes: ["5.3", "6.2"]
    },
    result: {
      enginePlatform: "GM Gen V V8",
      engineConfidence: "Moderate",
      engineSummary: "This Chevrolet profile commonly aligns with a direct injected GM Gen V V8 platform."
    }
  },
  {
    match: {
      make: "CHEVROLET",
      modelIncludes: ["MALIBU", "EQUINOX", "TRAVERSE", "BLAZER"],
      engineIncludes: ["1.5", "2.0"]
    },
    result: {
      enginePlatform: "GM Turbo Gasoline",
      engineConfidence: "Moderate",
      engineSummary: "This Chevrolet profile commonly aligns with a modern GM turbocharged gasoline engine family."
    }
  },
  {
    match: {
      make: "GMC",
      modelIncludes: ["SIERRA", "YUKON"],
      engineIncludes: ["5.3", "6.2"]
    },
    result: {
      enginePlatform: "GM Gen V V8",
      engineConfidence: "Moderate",
      engineSummary: "This GMC profile commonly aligns with a direct injected GM Gen V V8 platform."
    }
  },
  {
    match: {
      make: "TOYOTA",
      modelIncludes: ["CAMRY", "RAV4", "HIGHLANDER", "COROLLA"],
      trimIncludes: ["HYBRID"]
    },
    result: {
      enginePlatform: "Toyota Hybrid Synergy Drive",
      engineConfidence: "High",
      engineSummary: "This Toyota hybrid profile strongly points to Toyota Hybrid Synergy Drive architecture."
    }
  },
  {
    match: {
      make: "TOYOTA",
      modelIncludes: ["PRIUS"]
    },
    result: {
      enginePlatform: "Toyota Hybrid Synergy Drive",
      engineConfidence: "High",
      engineSummary: "This Prius profile strongly points to Toyota Hybrid Synergy Drive architecture."
    }
  },
  {
    match: {
      make: "TOYOTA",
      modelIncludes: ["TUNDRA", "SEQUOIA", "4RUNNER", "TACOMA"],
      engineIncludes: ["3.4", "4.0", "4.6", "5.7"]
    },
    result: {
      enginePlatform: "Toyota Truck and SUV Gasoline",
      engineConfidence: "Moderate",
      engineSummary: "This Toyota truck or SUV profile commonly aligns with a body on frame Toyota gasoline engine family."
    }
  },
  {
    match: {
      make: "HONDA",
      modelIncludes: ["CIVIC", "ACCORD", "CR-V", "HR-V"],
      engineIncludes: ["1.5", "2.0"]
    },
    result: {
      enginePlatform: "Honda Earth Dreams",
      engineConfidence: "Moderate",
      engineSummary: "This Honda profile commonly aligns with the Earth Dreams engine family."
    }
  },
  {
    match: {
      make: "HONDA",
      modelIncludes: ["ACCORD", "CR-V"],
      trimIncludes: ["HYBRID"]
    },
    result: {
      enginePlatform: "Honda Hybrid",
      engineConfidence: "Moderate",
      engineSummary: "This Honda hybrid profile commonly aligns with Honda's modern hybrid system architecture."
    }
  },
  {
    match: {
      make: "ACURA",
      modelIncludes: ["TLX", "RDX", "MDX", "INTEGRA"],
      engineIncludes: ["2.0", "2.4", "3.0", "3.5"]
    },
    result: {
      enginePlatform: "Honda Acura Modern Gasoline",
      engineConfidence: "Moderate",
      engineSummary: "This Acura profile commonly aligns with a modern Honda Acura gasoline engine family."
    }
  },
  {
    match: {
      make: "NISSAN",
      modelIncludes: ["ALTIMA", "ROGUE", "SENTRA", "MURANO", "PATHFINDER"],
      engineIncludes: ["2.5", "2.0", "3.5"]
    },
    result: {
      enginePlatform: "Nissan Modern Gasoline",
      engineConfidence: "Moderate",
      engineSummary: "This Nissan profile commonly aligns with a modern Nissan gasoline engine family."
    }
  },
  {
    match: {
      make: "INFINITI",
      modelIncludes: ["Q50", "Q60", "QX50", "QX60"],
      engineIncludes: ["2.0", "3.0", "3.5"]
    },
    result: {
      enginePlatform: "Infiniti Nissan Modern Gasoline",
      engineConfidence: "Moderate",
      engineSummary: "This Infiniti profile commonly aligns with a modern Nissan Infiniti gasoline engine family."
    }
  },
  {
    match: {
      make: "MERCEDESBENZ",
      modelIncludes: ["C300", "E300", "GLC300", "GLA250", "CLA250"],
      engineIncludes: ["2.0"]
    },
    result: {
      enginePlatform: "M274 or M264",
      engineConfidence: "Moderate",
      engineSummary: "This Mercedes profile commonly aligns with a modern turbocharged four cylinder Mercedes platform, though exact family should still be confirmed by year."
    }
  },
  {
    match: {
      make: "MERCEDESBENZ",
      modelIncludes: ["C43", "E43", "E450", "GLE450", "S450"],
      engineIncludes: ["3.0"]
    },
    result: {
      enginePlatform: "Mercedes Turbocharged Six Cylinder",
      engineConfidence: "Moderate",
      engineSummary: "This Mercedes profile commonly aligns with a modern turbocharged six cylinder platform."
    }
  },
  {
    match: {
      make: "LEXUS",
      modelIncludes: ["RX", "NX", "ES", "IS", "GS"],
      trimIncludes: ["HYBRID"]
    },
    result: {
      enginePlatform: "Toyota Lexus Hybrid",
      engineConfidence: "High",
      engineSummary: "This Lexus hybrid profile strongly points to Toyota Lexus hybrid system architecture."
    }
  },
  {
    match: {
      make: "LEXUS",
      modelIncludes: ["IS", "GS", "RC", "RX", "GX", "LX"],
      engineIncludes: ["2.0", "2.5", "3.5", "4.6", "5.0", "5.7"]
    },
    result: {
      enginePlatform: "Toyota Lexus Gasoline",
      engineConfidence: "Moderate",
      engineSummary: "This Lexus profile commonly aligns with a Toyota Lexus gasoline engine family."
    }
  },
  {
    match: {
      make: "VOLVO",
      modelIncludes: ["S60", "S90", "XC60", "XC90", "V60"],
      engineIncludes: ["2.0"]
    },
    result: {
      enginePlatform: "Volvo Drive E",
      engineConfidence: "High",
      engineSummary: "This Volvo profile strongly points to the Volvo Drive E four cylinder platform."
    }
  },
  {
    match: {
      make: "VOLVO",
      modelIncludes: ["XC90", "XC60", "S90"],
      trimIncludes: ["T8", "RECHARGE", "PLUGIN", "PHEV"]
    },
    result: {
      enginePlatform: "Volvo Drive E Hybrid",
      engineConfidence: "High",
      engineSummary: "This Volvo profile strongly points to a hybridized Drive E platform."
    }
  },
  {
    match: {
      make: "KIA",
      modelIncludes: ["OPTIMA", "K5", "SPORTAGE", "SORENTO", "SOUL", "FORTE"],
      engineIncludes: ["1.6", "2.0", "2.4", "2.5"]
    },
    result: {
      enginePlatform: "Kia Modern Gasoline",
      engineConfidence: "Moderate",
      engineSummary: "This Kia profile commonly aligns with a modern Kia gasoline engine family."
    }
  },
  {
    match: {
      make: "KIA",
      modelIncludes: ["NIRO", "SORENTO", "SPORTAGE"],
      trimIncludes: ["HYBRID", "PHEV", "PLUGIN"]
    },
    result: {
      enginePlatform: "Kia Hybrid",
      engineConfidence: "Moderate",
      engineSummary: "This Kia profile commonly aligns with a Kia hybrid system architecture."
    }
  },
  {
    match: {
      make: "HYUNDAI",
      modelIncludes: ["SONATA", "ELANTRA", "TUCSON", "SANTA FE", "KONA"],
      engineIncludes: ["1.6", "2.0", "2.4", "2.5"]
    },
    result: {
      enginePlatform: "Hyundai Modern Gasoline",
      engineConfidence: "Moderate",
      engineSummary: "This Hyundai profile commonly aligns with a modern Hyundai gasoline engine family."
    }
  },
  {
    match: {
      make: "HYUNDAI",
      modelIncludes: ["SONATA", "TUCSON", "SANTA FE", "KONA"],
      trimIncludes: ["HYBRID", "PHEV", "PLUGIN"]
    },
    result: {
      enginePlatform: "Hyundai Hybrid",
      engineConfidence: "Moderate",
      engineSummary: "This Hyundai profile commonly aligns with a Hyundai hybrid system architecture."
    }
  },
  {
    match: {
      make: "JEEP",
      modelIncludes: ["WRANGLER", "GRAND CHEROKEE", "CHEROKEE", "COMPASS"],
      engineIncludes: ["2.0", "3.2", "3.6", "5.7"]
    },
    result: {
      enginePlatform: "Jeep Chrysler Modern Gasoline",
      engineConfidence: "Moderate",
      engineSummary: "This Jeep profile commonly aligns with a Chrysler Jeep gasoline engine family."
    }
  },
  {
    match: {
      make: "RAM",
      modelIncludes: ["1500", "2500", "3500"],
      engineIncludes: ["3.6", "5.7", "6.4", "6.7"]
    },
    result: {
      enginePlatform: "Ram Chrysler Truck Powertrain",
      engineConfidence: "Moderate",
      engineSummary: "This Ram profile commonly aligns with a modern Chrysler truck gasoline or diesel powertrain family."
    }
  },
  {
    match: {
      make: "DODGE",
      modelIncludes: ["CHARGER", "CHALLENGER", "DURANGO"],
      engineIncludes: ["3.6", "5.7", "6.2", "6.4"]
    },
    result: {
      enginePlatform: "Pentastar or HEMI",
      engineConfidence: "Moderate",
      engineSummary: "This Dodge profile commonly aligns with either the Pentastar V6 family or a HEMI V8 platform depending on engine size."
    }
  },
  {
    match: {
      make: "SUBARU",
      modelIncludes: ["OUTBACK", "FORESTER", "CROSSTREK", "IMPREZA", "LEGACY", "WRX"],
      engineIncludes: ["2.0", "2.4", "2.5", "3.6"]
    },
    result: {
      enginePlatform: "Subaru Boxer",
      engineConfidence: "High",
      engineSummary: "This Subaru profile strongly points to a horizontally opposed Subaru boxer engine platform."
    }
  },
  {
    match: {
      make: "MAZDA",
      modelIncludes: ["MAZDA3", "MAZDA6", "CX-5", "CX-30", "CX-50", "CX-9", "CX-90"],
      engineIncludes: ["2.0", "2.5", "3.3"]
    },
    result: {
      enginePlatform: "Skyactiv",
      engineConfidence: "High",
      engineSummary: "This Mazda profile strongly points to Mazda's Skyactiv engine family."
    }
  },
  {
    match: {
      make: "PORSCHE",
      modelIncludes: ["MACAN", "CAYENNE", "PANAMERA", "911", "BOXSTER", "CAYMAN"],
      engineIncludes: ["2.0", "2.9", "3.0", "3.6", "4.0"]
    },
    result: {
      enginePlatform: "Porsche Modern Gasoline",
      engineConfidence: "Moderate",
      engineSummary: "This Porsche profile commonly aligns with a modern Porsche performance engine platform."
    }
  },
  {
    match: {
      make: "LANDROVER",
      modelIncludes: ["RANGE ROVER", "DISCOVERY", "DEFENDER", "EVOQUE", "VELAR"],
      engineIncludes: ["2.0", "3.0", "5.0"]
    },
    result: {
      enginePlatform: "Jaguar Land Rover Modern Gasoline",
      engineConfidence: "Moderate",
      engineSummary: "This Land Rover profile commonly aligns with a modern Jaguar Land Rover gasoline engine family."
    }
  },
  {
    match: {
      make: "JAGUAR",
      modelIncludes: ["XF", "XE", "F-PACE", "E-PACE", "F-TYPE"],
      engineIncludes: ["2.0", "3.0", "5.0"]
    },
    result: {
      enginePlatform: "Jaguar Land Rover Modern Gasoline",
      engineConfidence: "Moderate",
      engineSummary: "This Jaguar profile commonly aligns with a modern Jaguar Land Rover gasoline engine family."
    }
  },
  {
    match: {
      make: "TESLA",
      modelIncludes: ["MODEL 3", "MODEL Y", "MODEL S", "MODEL X"]
    },
    result: {
      enginePlatform: "Tesla Electric Drive Unit",
      engineConfidence: "High",
      engineSummary: "This Tesla profile strongly points to Tesla electric drive unit architecture rather than a conventional engine platform."
    }
  }
];

const TRANSMISSION_RULES = [
  {
    match: {
      make: "BMW",
      modelIncludes: ["3", "4", "5", "X3", "X5"]
    },
    result: {
      transmissionType: "ZF 8 Speed Automatic",
      transmissionRisk: "Low",
      transmissionSummary: "Widely regarded as one of the most reliable modern automatic transmissions when serviced correctly."
    }
  },
  {
    match: {
      make: "FORD",
      modelIncludes: ["F-150", "F150"]
    },
    result: {
      transmissionType: "10 Speed Automatic",
      transmissionRisk: "Moderate",
      transmissionSummary: "Modern multi speed transmission offering efficiency and performance, though some model years have reported shift quality concerns."
    }
  },
  {
    match: {
      make: "FORD",
      modelIncludes: ["FOCUS", "FIESTA"]
    },
    result: {
      transmissionType: "Dual Clutch Automatic",
      transmissionRisk: "Higher",
      transmissionSummary: "This transmission type has a known history of reliability and drivability complaints in certain model years."
    }
  },
  {
    match: {
      make: "VOLKSWAGEN",
      modelIncludes: ["GTI", "GLI", "GOLF", "JETTA"]
    },
    result: {
      transmissionType: "DSG Dual Clutch",
      transmissionRisk: "Moderate",
      transmissionSummary: "Fast shifting dual clutch transmission that requires proper servicing and can be costly if neglected."
    }
  },
  {
    match: {
      make: "AUDI",
      modelIncludes: ["A3", "A4", "A5", "Q5"]
    },
    result: {
      transmissionType: "S Tronic Dual Clutch",
      transmissionRisk: "Moderate",
      transmissionSummary: "Performance oriented dual clutch transmission with strong driving characteristics but higher servicing expectations."
    }
  },
  {
    match: {
      make: "TOYOTA"
    },
    result: {
      transmissionType: "Automatic or eCVT",
      transmissionRisk: "Low",
      transmissionSummary: "Toyota transmissions are generally low risk with strong long term reliability when maintained."
    }
  },
  {
    match: {
      make: "HONDA"
    },
    result: {
      transmissionType: "CVT or Automatic",
      transmissionRisk: "Moderate",
      transmissionSummary: "Modern Honda CVT systems are generally reliable, though driving feel and long term servicing should be considered."
    }
  },
  {
    match: {
      make: "NISSAN"
    },
    result: {
      transmissionType: "CVT",
      transmissionRisk: "Higher",
      transmissionSummary: "This transmission type has a known history of reliability concerns in multiple model lines."
    }
  },
  {
    match: {
      make: "SUBARU"
    },
    result: {
      transmissionType: "CVT or Manual",
      transmissionRisk: "Moderate",
      transmissionSummary: "Subaru CVT systems require proper maintenance and fluid servicing for long term reliability."
    }
  },
  {
    match: {
      make: "TESLA"
    },
    result: {
      transmissionType: "Single Speed Electric Drive",
      transmissionRisk: "Low",
      transmissionSummary: "Electric drive units eliminate traditional transmission complexity and reduce mechanical failure points."
    }
  }
];

function getDefaultEngineIntelligence(vehicle) {
  return {
    enginePlatform: vehicle.engine || "Unknown",
    engineConfidence: "Basic",
    engineSummary: "A deeper engine family match was not confidently identified for this vehicle yet."
  };
}

function getEngineIntelligence(vehicle) {
  for (const rule of ENGINE_RULES) {
    if (matchesEngineRule(vehicle, rule.match)) {
      return rule.result;
    }
  }

  return getDefaultEngineIntelligence(vehicle);
}

function getTransmissionIntelligence(vehicle) {
  for (const rule of TRANSMISSION_RULES) {
    if (matchesEngineRule(vehicle, rule.match)) {
      return rule.result;
    }
  }

  return {
    transmissionType: "Unknown",
    transmissionRisk: "Unknown",
    transmissionSummary: "Transmission profile could not be confidently identified."
  };
}

function getEngineRiskProfile(enginePlatform) {
  const value = String(enginePlatform || "").toUpperCase();

  if (!value) {
    return {
      engineRiskLevel: "Unknown",
      engineRiskNote: "No engine risk profile was confidently identified."
    };
  }

  if (value.includes("N20")) {
    return {
      engineRiskLevel: "Higher",
      engineRiskNote: "This engine profile carries a higher ownership risk due to known timing chain and oil leak related concern patterns."
    };
  }

  if (value.includes("N55")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This engine profile is generally known, but age, maintenance history, and leak related issues still matter."
    };
  }

  if (value.includes("B48")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This engine profile is generally viewed as stronger than earlier alternatives, though cooling system and gasket related maintenance still matter."
    };
  }

  if (value.includes("B58")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This engine profile is generally well regarded, but ownership cost can still rise quickly with neglected maintenance."
    };
  }

  if (value.includes("S55") || value.includes("S58")) {
    return {
      engineRiskLevel: "Higher",
      engineRiskNote: "High performance engine platforms can carry significantly higher ownership and repair exposure."
    };
  }

  if (value.includes("N20 OR B48")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This vehicle sits in an engine transition window, so exact engine confirmation matters before assigning a firmer ownership risk profile."
    };
  }

  return {
    engineRiskLevel: "Unknown",
    engineRiskNote: "A deeper engine risk profile was not confidently identified for this vehicle yet."
  };
}

function applyEngineRiskToVerdict(baseVerdict, vehicle) {
  const engineRisk = String(vehicle.engineRiskLevel || "").toUpperCase();

  if (!engineRisk) {
    return baseVerdict;
  }

  if (engineRisk === "HIGHER") {
    return {
      ...baseVerdict,
      headline: "Proceed carefully with engine related risk",
      summary: "This vehicle may still be worth considering, but the engine profile increases ownership risk and should be reflected in price, inspection depth, and maintenance review."
    };
  }

  if (engineRisk === "MODERATE") {
    return {
      ...baseVerdict,
      headline: "Worth viewing, but inspect carefully",
      summary: "This vehicle may still be worth considering, but the engine platform and maintenance history deserve careful review before agreeing on price."
    };
  }

  return baseVerdict;
}

function applyMechanicalRiskToVerdict(baseVerdict, vehicle) {
  const mechRisk = String(vehicle.mechanicalRiskLevel || "").toUpperCase();

  if (!mechRisk) {
    return baseVerdict;
  }

  if (mechRisk === "HIGHER") {
    return {
      ...baseVerdict,
      headline: "Proceed with caution due to overall mechanical risk",
      summary: "This vehicle presents higher mechanical risk based on engine and transmission profile. A purchase can still make sense, but only with strong inspection results and a price that reflects that risk."
    };
  }

  if (mechRisk === "MODERATE") {
    return {
      ...baseVerdict,
      headline: "Worth viewing, but mechanical risk should guide price",
      summary: "This vehicle sits in a moderate mechanical risk category. It may still be a good buy, but inspection quality, service history, and price alignment are important."
    };
  }

  if (mechRisk === "LOW") {
    return {
      ...baseVerdict,
      headline: "Generally favorable mechanical profile",
      summary: "This vehicle presents a relatively favorable mechanical profile. Standard inspection and maintenance checks still apply, but risk is lower than average."
    };
  }

  return baseVerdict;
}

function getMechanicalRisk(vehicle) {
  const engineRisk = String(vehicle.engineRiskLevel || "").toUpperCase();
  const transRisk = String(vehicle.transmissionRisk || "").toUpperCase();

  const riskMap = {
    LOW: 1,
    MODERATE: 2,
    HIGHER: 3
  };

  const engineScore = riskMap[engineRisk] || 2;
  const transScore = riskMap[transRisk] || 2;

  const combinedScore = Math.max(engineScore, transScore);

  let overallRisk = "Moderate";
  if (combinedScore === 3) overallRisk = "Higher";
  if (combinedScore === 1) overallRisk = "Low";

  let summary = "This vehicle sits in a moderate mechanical risk category based on engine and transmission characteristics.";

  if (overallRisk === "Higher") {
    summary = "This vehicle sits in a higher mechanical risk category driven by engine and or transmission profile. Inspection quality and purchase price become more critical.";
  }

  if (overallRisk === "Low") {
    summary = "This vehicle sits in a lower mechanical risk category with generally favorable engine and transmission characteristics.";
  }

  return {
    overallRisk,
    summary
  };
}

function getBuyerProfile(vehicle) {
  const risk = String(vehicle.mechanicalRiskLevel || "").toUpperCase();

  if (risk === "LOW") {
    return {
      buyerType: "Low Risk Buyer Friendly",
      buyerSummary: "Suitable for buyers looking for predictable ownership with fewer surprises.",
      explanation: "Low means this vehicle does not show strong public risk signals across engine, transmission, or complaint data. That does not mean risk is zero, but it suggests a more predictable ownership profile where standard inspection and maintenance checks are usually sufficient.",
      guidance: "Focus on condition, mileage, and service history, but overall ownership risk is lower than average."
    };
  }

  if (risk === "MODERATE") {
    return {
      buyerType: "Balanced Buyer",
      buyerSummary: "Suitable for buyers comfortable managing some risk in exchange for value or spec.",
      explanation: "Moderate means this vehicle shows some risk signals either in engine platform, transmission type, or ownership patterns. This does not automatically make it a bad buy, but it does mean service history, inspection quality, and price become more important to get right.",
      guidance: "Prioritize inspection quality, confirm maintenance history, and ensure the price reflects the risk profile."
    };
  }

  if (risk === "HIGHER") {
    return {
      buyerType: "Risk Tolerant Buyer",
      buyerSummary: "Better suited to experienced buyers or those prepared for higher ownership costs.",
      explanation: "Higher means this vehicle shows stronger risk signals in key areas such as engine platform, transmission profile, or complaint history. This does not automatically mean you should avoid it, but it does mean inspection depth, mechanical condition, and price negotiation should carry significantly more weight before making a decision.",
      guidance: "Only proceed with strong inspection results, clear service history, and a price that reflects potential repair exposure."
    };
  }

  return {
    buyerType: "General Buyer",
    buyerSummary: "Risk profile could not be clearly defined.",
    explanation: "This vehicle does not have a clearly defined risk profile based on available data.",
    guidance: "Proceed with a standard inspection and ensure service history is reviewed."
  };
}

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY in environment variables");
  process.exit(1);
}

if (!process.env.STRIPE_VIN_REPORT_PRICE_ID) {
  console.error("Missing STRIPE_VIN_REPORT_PRICE_ID in environment variables");
  process.exit(1);
}

if (!process.env.BASE_URL) {
  console.error("Missing BASE_URL in environment variables");
  process.exit(1);
}

if (!process.env.API_BASE) {
  console.error("Missing API_BASE in environment variables");
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

console.log("Stripe key loaded:", process.env.STRIPE_SECRET_KEY ? "YES" : "NO");
console.log("Stripe key prefix:", process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.slice(0, 8) : "MISSING");
console.log("Stripe price id actual:", JSON.stringify(process.env.STRIPE_VIN_REPORT_PRICE_ID));
console.log("BASE_URL loaded:", process.env.BASE_URL);
console.log("API_BASE loaded:", process.env.API_BASE);

app.use(cors());
app.use(express.json());

function sanitizeVin(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[IOQ]/g, "")
    .slice(0, 17);
}

function safeValue(value, fallback = "") {
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function upperText(value) {
  return safeValue(value).toUpperCase();
}

function intValue(value) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function xmlTag(xml, tag) {
  const match = String(xml || "").match(new RegExp(`<${tag}>(.*?)</${tag}>`, "i"));
  return match ? match[1].trim() : "";
}

function buildVehicleTitle(vehicle) {
  return [
    safeValue(vehicle.year),
    safeValue(vehicle.make),
    safeValue(vehicle.model),
    safeValue(vehicle.trim)
  ].filter(Boolean).join(" ");
}

function buildEcoBadge(ghgScore, smartwayScore) {
  const ghg = Number(ghgScore || 0);
  const smartway = String(smartwayScore || "");

  if (smartway === "2") return "SmartWay Elite";
  if (smartway === "1") return "SmartWay";
  if (ghg >= 8) return "Low Emissions";
  if (ghg > 0 && ghg <= 4) return "Higher Emissions";

  return "Standard Profile";
}

function getBodyType(vehicle) {
  const body = upperText(vehicle.body);

  if (body.includes("COUPE")) return "coupe";
  if (body.includes("CONVERTIBLE") || body.includes("CABRIOLET") || body.includes("ROADSTER")) return "convertible";
  if (body.includes("WAGON") || body.includes("ESTATE") || body.includes("TOURING")) return "wagon";
  if (body.includes("HATCHBACK") || body.includes("LIFTBACK") || body.includes("FASTBACK")) return "hatchback";
  if (body.includes("SEDAN") || body.includes("SALOON")) return "sedan";
  if (body.includes("SPORT UTILITY") || body.includes("MULTIPURPOSE") || body.includes("CROSSOVER") || body.includes("UTILITY")) return "suv";
  if (body.includes("PICKUP")) return "truck";

  return "unknown";
}

function getDriveTypeGroup(vehicle) {
  const drive = upperText(vehicle.drive);

  if (drive.includes("AWD") || drive.includes("4WD") || drive.includes("4X4") || drive.includes("XDRIVE") || drive.includes("QUATTRO")) return "awd";
  if (drive.includes("FWD") || drive.includes("FRONT")) return "fwd";
  if (drive.includes("RWD") || drive.includes("REAR")) return "rwd";

  return "unknown";
}

function getFuelGroup(vehicle) {
  const fuel = upperText(vehicle.fuel);

  if (fuel.includes("ELECTRIC")) return "electric";
  if (fuel.includes("HYBRID") || fuel.includes("PHEV") || fuel.includes("PLUG")) return "hybrid";
  if (fuel.includes("DIESEL")) return "diesel";
  if (fuel.includes("GAS") || fuel.includes("GASOLINE") || fuel.includes("PETROL")) return "gas";

  return "unknown";
}

function isLuxuryBrand(make) {
  return [
    "BMW", "AUDI", "MERCEDES-BENZ", "MERCEDES", "PORSCHE", "LEXUS", "ACURA", "INFINITI",
    "CADILLAC", "GENESIS", "JAGUAR", "LAND ROVER", "VOLVO", "ALFA ROMEO", "TESLA",
    "LUCID", "RIVIAN", "MASERATI", "BENTLEY"
  ].includes(upperText(make));
}

function buildReportDateString() {
  const now = new Date();
  return now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function buildStockId(vehicle) {
  const parts = [
    safeValue(vehicle.year),
    safeValue(vehicle.make),
    safeValue(vehicle.model),
    safeValue(vehicle.trim || vehicle.series || "BASE")
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return parts || "VIN_REPORT";
}

function buildRecallSeverityLabel(item) {
  const text = upperText(
    safeValue(item.Component) + " " +
    safeValue(item.Summary) + " " +
    safeValue(item.Remedy)
  );

  if (
    text.includes("AIR BAG") ||
    text.includes("BRAKE") ||
    text.includes("FIRE") ||
    text.includes("STEERING") ||
    text.includes("FUEL LEAK")
  ) {
    return "Higher Attention";
  }

  if (
    text.includes("VISIBILITY") ||
    text.includes("ELECTRICAL") ||
    text.includes("SUSPENSION") ||
    text.includes("POWER TRAIN") ||
    text.includes("POWERTRAIN")
  ) {
    return "Moderate Attention";
  }

  return "General Attention";
}

async function fetchRecalls(year, make, model) {
  try {
    if (!year || !make || !model) {
      return {
        recalls: 0,
        recallSummary: "Recall data could not be checked because key vehicle details were missing.",
        recallDetails: []
      };
    }

    const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`;
    const response = await fetch(url);

    if (!response.ok) {
      return {
        recalls: 0,
        recallSummary: "Recall data could not be retrieved right now.",
        recallDetails: []
      };
    }

    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];

    const recallDetails = results.slice(0, 12).map(item => ({
      campaignNumber: safeValue(item.NHTSACampaignNumber || item.nhtsa_campaign_number || item.CampaignNumber),
      component: safeValue(item.Component || item.component || "General safety item"),
      summary: safeValue(item.Summary || item.summary || "Recall details available."),
      reportDate: safeValue(item.ReportReceivedDate || item.report_received_date),
      remedy: safeValue(item.Remedy || item.remedy),
      manufacturer: safeValue(item.Manufacturer || item.manufacturer),
      severity: buildRecallSeverityLabel(item)
    }));

    return {
      recalls: results.length,
      recallSummary: results.length
        ? `${results.length} manufacturer safety recall records found for this exact model year, make, and model.`
        : "No manufacturer safety recalls found for this exact model year, make, and model.",
      recallDetails
    };
  } catch {
    return {
      recalls: 0,
      recallSummary: "Recall data could not be retrieved right now.",
      recallDetails: []
    };
  }
}

async function fetchComplaints(year, make, model) {
  try {
    if (!year || !make || !model) {
      return {
        complaints: 0,
        topComponent: "",
        complaintSummary: "Complaint data could not be checked because key vehicle details were missing.",
        dataAvailable: false,
        complaintComponents: [],
        complaintDetails: []
      };
    }

    const url = `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`;
    const response = await fetch(url);

    if (!response.ok) {
      return {
        complaints: 0,
        topComponent: "",
        complaintSummary: "Complaint data could not be retrieved right now.",
        dataAvailable: false,
        complaintComponents: [],
        complaintDetails: []
      };
    }

    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];

    const counts = {};
    for (const item of results) {
      const key = String(
        item.components ||
        item.component ||
        item.Component ||
        "Unknown Component"
      ).trim();

      counts[key] = (counts[key] || 0) + 1;
    }

    let topComponent = "";
    let topCount = 0;

    for (const key in counts) {
      if (counts[key] > topCount) {
        topCount = counts[key];
        topComponent = key;
      }
    }

    const complaintComponents = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([component, count]) => ({
        component,
        count
      }));

    const complaintDetails = results.slice(0, 10).map(item => ({
      component: safeValue(item.components || item.component || item.Component || "Unknown Component"),
      summary: safeValue(item.summary || item.Summary || item.description || "Complaint record present."),
      date: safeValue(item.dateComplaintFiled || item.DateComplaintFiled || item.ReportReceivedDate),
      mileage: safeValue(item.mileage || item.Mileage)
    }));

    return {
      complaints: results.length,
      topComponent,
      complaintSummary: results.length
        ? `${results.length} owner complaint records found for this exact model year, make, and model.`
        : "No owner complaints found for this exact model year, make, and model.",
      dataAvailable: true,
      complaintComponents,
      complaintDetails
    };
  } catch {
    return {
      complaints: 0,
      topComponent: "",
      complaintSummary: "Complaint data could not be retrieved right now.",
      dataAvailable: false,
      complaintComponents: [],
      complaintDetails: []
    };
  }
}

async function fetchEfficiency(year, make, model) {
  try {
    if (!year || !make || !model) {
      return {
        combinedMPG: "",
        annualFuelCost: "",
        ghgScore: "",
        ecoBadge: "",
        efficiencySummary: "Efficiency data could not be checked because key vehicle details were missing.",
        dataAvailable: false
      };
    }

    const optionsUrl = `https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`;
    const optionsResponse = await fetch(optionsUrl);

    if (!optionsResponse.ok) {
      return {
        combinedMPG: "",
        annualFuelCost: "",
        ghgScore: "",
        ecoBadge: "",
        efficiencySummary: "Fuel economy data could not be retrieved right now.",
        dataAvailable: false
      };
    }

    const optionsXml = await optionsResponse.text();
    const vehicleId = xmlTag(optionsXml, "value");

    if (!vehicleId) {
      return {
        combinedMPG: "",
        annualFuelCost: "",
        ghgScore: "",
        ecoBadge: "",
        efficiencySummary: "No matching fuel economy record was found for this vehicle profile.",
        dataAvailable: false
      };
    }

    const detailUrl = `https://www.fueleconomy.gov/ws/rest/vehicle/${encodeURIComponent(vehicleId)}`;
    const detailResponse = await fetch(detailUrl);

    if (!detailResponse.ok) {
      return {
        combinedMPG: "",
        annualFuelCost: "",
        ghgScore: "",
        ecoBadge: "",
        efficiencySummary: "Fuel economy detail data could not be retrieved right now.",
        dataAvailable: false
      };
    }

    const detailXml = await detailResponse.text();

    const combinedMPG = xmlTag(detailXml, "comb08");
    const annualFuelCostRaw = xmlTag(detailXml, "fuelCost08");
    const ghgScore = xmlTag(detailXml, "ghgScore");
    const smartwayScore = xmlTag(detailXml, "smartwayScore");

    let annualFuelCost = "";
    if (annualFuelCostRaw && !Number.isNaN(Number(annualFuelCostRaw))) {
      annualFuelCost = `$${Number(annualFuelCostRaw).toLocaleString()}`;
    }

    return {
      combinedMPG,
      annualFuelCost,
      ghgScore,
      ecoBadge: buildEcoBadge(ghgScore, smartwayScore),
      efficiencySummary: combinedMPG
        ? "Fuel economy data matched successfully."
        : "Fuel economy data was checked but no combined MPG value was returned.",
      dataAvailable: !!combinedMPG
    };
  } catch {
    return {
      combinedMPG: "",
      annualFuelCost: "",
      ghgScore: "",
      ecoBadge: "",
      efficiencySummary: "Fuel economy data could not be retrieved right now.",
      dataAvailable: false
    };
  }
}

async function fetchInvestigations(year, make, model) {
  try {
    if (!year || !make || !model) {
      return {
        investigations: [],
        investigationSummary: ""
      };
    }

    const url = "https://static.nhtsa.gov/odi/odi_investigations.json";
    const response = await fetch(url);

    if (!response.ok) {
      return {
        investigations: [],
        investigationSummary: ""
      };
    }

    const data = await response.json();
    const rows = Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : [];

    const normalizedMake = upperText(make);
    const normalizedModel = upperText(model);
    const numericYear = intValue(year);

    const matches = rows.filter(item => {
      const text = upperText(
        safeValue(item.Manufacturer) + " " +
        safeValue(item.make) + " " +
        safeValue(item.Product) + " " +
        safeValue(item.Model) + " " +
        safeValue(item.Summary)
      );

      const yearText = safeValue(item.ModelYear || item.modelYear || item.Year);
      const hasMake = text.includes(normalizedMake);
      const hasModel = normalizedModel && text.includes(normalizedModel);
      const hasYear = numericYear ? yearText.includes(String(numericYear)) || text.includes(String(numericYear)) : true;

      return hasMake && (hasModel || normalizedModel.length < 3) && hasYear;
    }).slice(0, 8);

    const investigations = matches.map(item => ({
      actionNumber: safeValue(item.ActionNumber || item.actionNumber),
      component: safeValue(item.Component || item.component),
      summary: safeValue(item.Summary || item.summary || "Investigation record present."),
      dateOpened: safeValue(item.DateOpened || item.dateOpened || item.OpenDate),
      status: safeValue(item.Status || item.status || item.ClosingResume || "Recorded")
    }));

    return {
      investigations,
      investigationSummary: investigations.length
        ? `${investigations.length} possible safety investigation matches found for this vehicle profile.`
        : ""
    };
  } catch {
    return {
      investigations: [],
      investigationSummary: ""
    };
  }
}

function buildSpecsFromDecode(row, vehicle) {
  const length = safeValue(row.VehicleLength || row.WheelBaseLong);
  const width = safeValue(row.VehicleWidth);
  const height = safeValue(row.VehicleHeight);

  let engineFallback = "";
  let transmissionFallback = "";

  if (upperText(vehicle.make) === "BMW") {
    engineFallback = "2.0L TwinPower Turbo I4";
    transmissionFallback = "8-Speed ZF Automatic";
  } else if (upperText(vehicle.make) === "AUDI") {
    transmissionFallback = "Automatic transmission configuration";
  } else if (upperText(vehicle.make).includes("MERCEDES")) {
    transmissionFallback = "Automatic transmission configuration";
  } else {
    transmissionFallback = "Automatic transmission configuration";
  }

  return {
    horsepower: safeValue(row.EngineHP),
    transmission: safeValue(row.TransmissionStyle || row.TransmissionSpeeds, transmissionFallback),
    dimensions: [length, width, height].filter(Boolean).join(" × "),
    curbWeight: safeValue(row.CurbWeightLB),
    weightClass: safeValue(row.GVWR),
    engineDisplay: safeValue(row.EngineModel, engineFallback)
  };
}

function buildOptionProfile(vehicle) {
  const make = upperText(vehicle.make);
  const trim = upperText(vehicle.trim);
  const year = intValue(vehicle.year) || 0;
  const body = getBodyType(vehicle);
  const drive = getDriveTypeGroup(vehicle);
  const fuel = getFuelGroup(vehicle);

  let sportScore = 34;
  let comfortScore = 42;
  let techScore = 38;

  let sportLabel = "Sport Package";
  let comfortLabel = "Comfort Package";
  let techLabel = year >= 2019 ? "Driver Assistance Package" : "Technology Package";

  if (make === "BMW") {
    sportLabel = "M Sport Package";
    comfortLabel = "Premium Package";
    techLabel = year >= 2019 ? "Driver Assistance or Live Cockpit Package" : "Technology Package";
  }

  if (make === "AUDI") {
    sportLabel = "S line Package";
    comfortLabel = "Premium Package";
    techLabel = "Technology Package";
  }

  if (make.includes("MERCEDES")) {
    sportLabel = "AMG Line or Sport Package";
    comfortLabel = "Premium Package";
    techLabel = "Driver Assistance Package";
  }

  if (make === "LEXUS") {
    sportLabel = "F Sport Package";
    comfortLabel = "Premium Package";
    techLabel = "Navigation or Safety Package";
  }

  if (body === "coupe" || body === "convertible") sportScore += 18;
  if (body === "suv") comfortScore += 12;
  if (drive === "awd") comfortScore += 6;
  if (fuel === "hybrid" || fuel === "electric") techScore += 16;
  if (year >= 2019) techScore += 14;

  if (trim.includes("M SPORT") || trim.includes("SPORT") || trim.includes("S LINE") || trim.includes("AMG")) sportScore += 18;
  if (trim.includes("PREMIUM") || trim.includes("LUXURY") || trim.includes("LIMITED") || trim.includes("PLATINUM")) comfortScore += 18;
  if (trim.includes("TECH") || trim.includes("ADVANCE") || trim.includes("PRESTIGE") || trim.includes("ELITE")) techScore += 18;

  const clamp = (n) => Math.max(18, Math.min(99, Math.round(n)));

  return {
    sport: {
      label: sportLabel,
      probability: clamp(sportScore)
    },
    comfort: {
      label: comfortLabel,
      probability: clamp(comfortScore)
    },
    tech: {
      label: techLabel,
      probability: clamp(techScore)
    }
  };
}

function inferEnginePlatform(vehicle) {
  const make = upperText(vehicle.make);
  const model = upperText(vehicle.model);
  const trim = upperText(vehicle.trim);
  const year = intValue(vehicle.year);

  if (make === "BMW") {
    if (model.includes("340") || trim.includes("340") || trim.includes("M340")) {
      return {
        enginePlatform: "B58",
        engineLabel: "Likely B58 3.0L Turbo Inline 6",
        engineConfidence: "High"
      };
    }

    if (model.includes("330E")) {
      return {
        enginePlatform: "B48 Hybrid",
        engineLabel: "Likely B48 based plug in hybrid powertrain",
        engineConfidence: "High"
      };
    }

    if (model.includes("320") || model.includes("328") || model.includes("330")) {
      if (year === 2016) {
        return {
          enginePlatform: "N20 or B48",
          engineLabel: "2.0L TwinPower Turbo I4",
          engineConfidence: "Moderate"
        };
      }

      if (year && year >= 2017) {
        return {
          enginePlatform: "B48",
          engineLabel: "2.0L TwinPower Turbo I4",
          engineConfidence: "High"
        };
      }

      return {
        enginePlatform: "N20 or B48",
        engineLabel: "2.0L TwinPower Turbo I4",
        engineConfidence: "Moderate"
      };
    }

    if (model.includes("335")) {
      return {
        enginePlatform: "N55",
        engineLabel: "Likely N55 3.0L Turbo Inline 6",
        engineConfidence: "High"
      };
    }
  }

  if (make === "AUDI") {
    return {
      enginePlatform: "Turbocharged TFSI Platform",
      engineLabel: safeValue(vehicle.engine, "Turbocharged Audi engine configuration"),
      engineConfidence: "Moderate"
    };
  }

  if (make.includes("MERCEDES")) {
    return {
      enginePlatform: "Mercedes turbocharged platform",
      engineLabel: safeValue(vehicle.engine, "Turbocharged Mercedes powertrain"),
      engineConfidence: "Moderate"
    };
  }

  if (make === "LEXUS" || make === "TOYOTA") {
    return {
      enginePlatform: "Toyota family powertrain",
      engineLabel: safeValue(vehicle.engine, "Toyota or Lexus engine configuration"),
      engineConfidence: "Moderate"
    };
  }

  return {
    enginePlatform: "Manufacturer specific platform",
    engineLabel: safeValue(vehicle.engine, "Manufacturer specific engine configuration"),
    engineConfidence: "Low"
  };
}

function buildPlatformSummary(vehicle) {
  const make = safeValue(vehicle.make);
  const model = safeValue(vehicle.model);
  const body = getBodyType(vehicle);
  const fuel = getFuelGroup(vehicle);

  let summary = `${make} ${model} should be evaluated with attention to service history, drivetrain behavior, warning lights, and visible repair quality.`;

  if (body === "suv") {
    summary = `${make} ${model} combines higher vehicle weight with more suspension and tire load than a typical sedan, so buyers should look carefully at front end wear, alignment behavior, and driveline smoothness.`;
  }

  if (fuel === "electric" || fuel === "hybrid") {
    summary = `${make} ${model} uses an electrified powertrain profile, so battery system health, cooling performance, warning lights, and software behavior matter more than on a conventional gasoline vehicle.`;
  }

  if (upperText(make) === "BMW") {
    summary = `${make} ${model} sits in a higher maintenance ownership category than a typical mass market vehicle, and buyers should focus on cooling, oil leaks, driveline smoothness, electronics, and proof of regular servicing.`;
  }

  return summary;
}

function buildOwnershipIntelligence(vehicle, safety) {
    const engineRisk = String(vehicle.engineRiskLevel || "").toUpperCase();
  const engineInfo = inferEnginePlatform(vehicle);
  const complaints = Number(safety.complaints || 0);
  const make = upperText(vehicle.make);
  const body = getBodyType(vehicle);
  const fuel = getFuelGroup(vehicle);
  const drive = getDriveTypeGroup(vehicle);

  let maintenanceComplexity = "Moderate";
if (isLuxuryBrand(vehicle.make)) maintenanceComplexity = "Higher";
if (fuel === "hybrid" || fuel === "electric") maintenanceComplexity = "Moderate to Higher";

if (engineRisk === "HIGHER") maintenanceComplexity = "Higher";

if (engineRisk === "MODERATE" && maintenanceComplexity === "Moderate") {
  maintenanceComplexity = "Higher";
}

  let complaintLevel = "Low";
  if (complaints >= 50) complaintLevel = "Higher";
  else if (complaints >= 15) complaintLevel = "Moderate";

  const commonIssues = [
    "Service history gaps",
    "Suspension wear",
    "Brake wear",
    "Electrical issues"
  ];

  const inspectionChecks = [
    "Review service history",
    "Check warning lights",
    "Inspect tires and brakes",
    "Test drivetrain response",
    "Inspect for fluid leaks"
  ];

  const expensiveFailureAreas = [
    "Transmission related repairs",
    "Suspension wear items",
    "Electrical and module faults"
  ];

  const testDriveChecks = [
    "Check steering straightness",
    "Listen for brake or suspension noise",
    "Test acceleration and shifting",
    "Look for warning lights after driving"
  ];

  if (body === "suv") {
    commonIssues.push("Higher weight related suspension wear");
    expensiveFailureAreas.push("Front suspension and wheel bearing wear");
  }

  if (fuel === "hybrid" || fuel === "electric") {
    commonIssues.push("Electrified system diagnostic complexity");
    expensiveFailureAreas.push("Battery and power electronics diagnostics");
  }

  if (drive === "awd") {
    commonIssues.push("All wheel drive system servicing");
    expensiveFailureAreas.push("Transfer case or coupling related repairs");
    testDriveChecks.push("Check for binding on a tight low speed turn");
  }

  if (body === "truck") {
    expensiveFailureAreas.push("Tow related drivetrain wear");
  }

  if (make === "BMW") {
    commonIssues.push("Cooling system checks");
    commonIssues.push("Oil leak inspection");
    commonIssues.push("Electronic faults");
    commonIssues.push("Service history gaps");

    inspectionChecks.push("Inspect for coolant or oil leaks");
    inspectionChecks.push("Check for poor accident repairs");

    expensiveFailureAreas.push("Cooling system components");
    expensiveFailureAreas.push("Oil leaks and gasket repairs");

    testDriveChecks.push("Watch for drivetrain hesitation");
    testDriveChecks.push("Confirm smooth transmission behavior");
  }

  let platformSummary = buildPlatformSummary(vehicle);

  let ownershipAdvice = `${safeValue(vehicle.make)} ${safeValue(vehicle.model)} should be evaluated with attention to service history, warning lights, fluid leaks, drivetrain behavior, and evidence of preventive maintenance.`;

  if (engineRisk === "HIGHER") {
    platformSummary = `${safeValue(vehicle.make)} ${safeValue(vehicle.model)} sits in a higher maintenance ownership category, and the engine profile increases the importance of service history, leak inspection, and preventive maintenance discipline.`;

    ownershipAdvice = `${safeValue(vehicle.make)} ${safeValue(vehicle.model)} should be evaluated very carefully with attention to engine related risk, service history, warning lights, fluid leaks, and evidence of strong preventive maintenance.`;
  }

  if (engineRisk === "MODERATE") {
    platformSummary = `${safeValue(vehicle.make)} ${safeValue(vehicle.model)} sits in a higher maintenance ownership category, and the engine platform means buyers should pay close attention to service history, cooling health, leaks, and driveline smoothness.`;

    ownershipAdvice = `${safeValue(vehicle.make)} ${safeValue(vehicle.model)} should be evaluated with close attention to service history, warning lights, fluid leaks, drivetrain behavior, and evidence of preventive maintenance.`;
  }
  
  return {
    brandFocus: safeValue(vehicle.make) || "Generic",
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: safeValue(vehicle.series || vehicle.model || "Vehicle platform"),
    platformSummary,
    enginePlatform: engineInfo.enginePlatform,
    engineLabel: engineInfo.engineLabel,
    engineConfidence: engineInfo.engineConfidence,
    maintenanceComplexity,
    complaintLevel,
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    expensiveFailureAreas: Array.from(new Set(expensiveFailureAreas)),
    testDriveChecks: Array.from(new Set(testDriveChecks)),
    ownershipAdvice
  };
}

function getBrandTier(make) {
  const value = String(make || "").trim().toUpperCase();

  const exoticBrands = new Set([
    "FERRARI",
    "LAMBORGHINI",
    "MCLAREN",
    "ASTON MARTIN",
    "BENTLEY",
    "ROLLS-ROYCE",
    "ROLLS ROYCE",
    "MASERATI"
  ]);

  const premiumBrands = new Set([
    "BMW",
    "MERCEDES-BENZ",
    "MERCEDES",
    "AUDI",
    "LEXUS",
    "PORSCHE",
    "JAGUAR",
    "LAND ROVER",
    "RANGE ROVER",
    "VOLVO",
    "GENESIS",
    "INFINITI",
    "ACURA",
    "CADILLAC",
    "LINCOLN",
    "ALFA ROMEO"
  ]);

  const nearPremiumBrands = new Set([
    "MINI",
    "BUICK",
    "CHRYSLER",
    "MAZDA"
  ]);

  if (exoticBrands.has(value)) return "exotic";
  if (premiumBrands.has(value)) return "premium";
  if (nearPremiumBrands.has(value)) return "near_premium";
  return "mainstream";
}

function getVehicleSegment(vehicle) {
  const body = String(vehicle.body || "").trim().toUpperCase();
  const model = String(vehicle.model || "").trim().toUpperCase();

  if (body.includes("PICKUP") || body.includes("TRUCK")) {
    if (model.includes("2500") || model.includes("3500") || model.includes("HD")) {
      return "heavy_duty_truck";
    }
    return "pickup";
  }

  if (body.includes("SUV") || body.includes("SPORT UTILITY") || body.includes("CROSSOVER")) {
    if (body.includes("SMALL") || body.includes("COMPACT") || model.includes("HR-V") || model.includes("C-HR")) {
      return "compact_suv";
    }
    if (body.includes("LARGE") || body.includes("FULL SIZE") || model.includes("SUBURBAN") || model.includes("EXPEDITION")) {
      return "large_suv";
    }
    return "midsize_suv";
  }

  if (body.includes("VAN")) {
    if (body.includes("CARGO")) return "cargo_van";
    return "van";
  }

  if (body.includes("COUPE")) return "coupe";
  if (body.includes("CONVERTIBLE") || body.includes("CABRIO")) return "convertible";
  if (body.includes("HATCHBACK")) return "hatchback";
  if (body.includes("WAGON")) return "wagon";

  if (body.includes("SEDAN") || body.includes("SALOON")) {
    if (body.includes("COMPACT") || model.includes("COROLLA") || model.includes("CIVIC")) {
      return "compact_car";
    }
    if (body.includes("FULL SIZE") || model.includes("300") || model.includes("TAURUS")) {
      return "fullsize_car";
    }
    return "midsize_car";
  }

  return "midsize_car";
}

function getVehicleAgeBucket(year) {
  const currentYear = 2026;
  const vehicleYear = intValue(year);

  if (!vehicleYear) return "unknown";

  const age = currentYear - vehicleYear;

  if (age <= 1) return "0_1";
  if (age <= 3) return "2_3";
  if (age <= 5) return "4_5";
  if (age <= 8) return "6_8";
  if (age <= 12) return "9_12";
  return "13_plus";
}

function getDriveGroupForMarket(vehicle) {
  const value = String(vehicle.drive || "").trim().toUpperCase();

  if (value.includes("FWD") || value.includes("FRONT")) return "fwd";
  if (value.includes("RWD") || value.includes("REAR")) return "rwd";
  if (value.includes("AWD") || value.includes("ALL")) return "awd";
  if (value.includes("4WD") || value.includes("4X4") || value.includes("FOUR")) return "4wd";

  return "rwd";
}

function getFuelGroupForMarket(vehicle) {
  const value = String(vehicle.fuel || "").trim().toUpperCase();

  if (value.includes("DIESEL")) return "diesel";
  if (value.includes("PLUG") || value.includes("PHEV")) return "phev";
  if (value.includes("HYBRID")) return "hybrid";
  if (value.includes("ELECTRIC") || value === "EV") return "electric";
  return "gasoline";
}

function riskLabelToScore(label) {
  const value = String(label || "").trim().toUpperCase();

  if (value === "LOW") return 20;
  if (value === "MODERATE") return 50;
  if (value === "HIGHER") return 80;

  return 50;
}

function roundToNearestHundred(value) {
  return Math.round(Number(value || 0) / 100) * 100;
}

const BASE_MARKET_RULES = {
  brandTierMultiplier: {
    mainstream: 1.00,
    near_premium: 1.08,
    premium: 1.20,
    exotic: 1.55
  },

  segmentBase: {
    compact_car: 20500,
    midsize_car: 25500,
    fullsize_car: 33500,
    coupe: 29000,
    convertible: 36000,
    hatchback: 21500,
    wagon: 28500,
    compact_suv: 29500,
    midsize_suv: 37500,
    large_suv: 52000,
    pickup: 40500,
    heavy_duty_truck: 58500,
    van: 34500,
    cargo_van: 38500
  },

  drivetrainMultiplier: {
    fwd: 0.98,
    rwd: 1.00,
    awd: 1.06,
    "4wd": 1.09
  },

  fuelTypeMultiplier: {
    gasoline: 1.00,
    diesel: 1.07,
    hybrid: 1.09,
    phev: 1.12,
    electric: 1.14
  },

  ageDepreciationMultiplier: {
    "0_1": 0.92,
    "2_3": 0.79,
    "4_5": 0.66,
    "6_8": 0.50,
    "9_12": 0.34,
    "13_plus": 0.21,
    unknown: 0.35
  },

  riskAdjustments: {
    very_low: 1.00,
    low: 0.97,
    moderate: 0.93,
    high: 0.88,
    severe: 0.81
  }
};

function buildMarketAnalysis(vehicle) {
  const year = intValue(vehicle.year) || 2018;
  const brandTier = getBrandTier(vehicle.make);
  const vehicleSegment = getVehicleSegment(vehicle);
  const ageBucket = getVehicleAgeBucket(year);
  const drivetrain = getDriveGroupForMarket(vehicle);
  const fuelType = getFuelGroupForMarket(vehicle);

  const segmentBase = BASE_MARKET_RULES.segmentBase[vehicleSegment] || 25500;
  const brandTierMultiplier = BASE_MARKET_RULES.brandTierMultiplier[brandTier] || 1.0;
  const drivetrainMultiplier = BASE_MARKET_RULES.drivetrainMultiplier[drivetrain] || 1.0;
  const fuelTypeMultiplier = BASE_MARKET_RULES.fuelTypeMultiplier[fuelType] || 1.0;
  const ageDepreciationMultiplier = BASE_MARKET_RULES.ageDepreciationMultiplier[ageBucket] || 0.35;

  const preRiskMarketCenter =
    segmentBase *
    brandTierMultiplier *
    drivetrainMultiplier *
    fuelTypeMultiplier *
    ageDepreciationMultiplier;

  const engineRiskScore = riskLabelToScore(vehicle.engineRiskLevel);
  const transmissionRiskScore = riskLabelToScore(vehicle.transmissionRisk);
  const mechanicalRiskScore = riskLabelToScore(vehicle.mechanicalRiskLevel);

  const riskLabel = String(vehicle.mechanicalRiskLevel || "").trim().toUpperCase();

let flatAdjustment = 0;

if (riskLabel === "HIGHER") {
  flatAdjustment = -3000;
} else if (riskLabel === "MODERATE") {
  flatAdjustment = -1500;
}

const weightedRiskScore = Math.round(
  (engineRiskScore * 0.4) +
  (transmissionRiskScore * 0.35) +
  (mechanicalRiskScore * 0.25)
);

let overallRiskBand = "moderate";
if (weightedRiskScore <= 15) overallRiskBand = "very_low";
else if (weightedRiskScore <= 35) overallRiskBand = "low";
else if (weightedRiskScore <= 55) overallRiskBand = "moderate";
else if (weightedRiskScore <= 75) overallRiskBand = "high";
else overallRiskBand = "severe";

const riskMultiplier = BASE_MARKET_RULES.riskAdjustments[overallRiskBand] || 0.93;
const riskAdjustedCenter = preRiskMarketCenter * riskMultiplier;
const riskDelta = Math.round(riskAdjustedCenter - preRiskMarketCenter);
const totalAdjustment = riskDelta + flatAdjustment;

const retailLow = roundToNearestHundred(preRiskMarketCenter * 0.92);
const retailHigh = roundToNearestHundred(preRiskMarketCenter * 1.08);

const tradeLow = roundToNearestHundred(preRiskMarketCenter * 0.80);
const tradeHigh = roundToNearestHundred(preRiskMarketCenter * 0.91);

const buyerLow = roundToNearestHundred((preRiskMarketCenter * 0.84) + totalAdjustment);
const buyerHigh = roundToNearestHundred((preRiskMarketCenter * 0.95) + totalAdjustment);

const retailExcellent = roundToNearestHundred(retailHigh);
const retailGood = roundToNearestHundred(preRiskMarketCenter);
const retailFair = roundToNearestHundred((preRiskMarketCenter * 0.92) + totalAdjustment);

  const tradeExcellent = roundToNearestHundred(tradeHigh);
  const tradeGood = roundToNearestHundred((tradeLow + tradeHigh) / 2);
  const tradeFair = roundToNearestHundred(tradeLow);

  let analystNote = `This ${year} ${safeValue(vehicle.make)} ${safeValue(vehicle.model)} sits in the ${ageBucket} value window. Market positioning reflects brand tier, segment, drivetrain, fuel type, and age based depreciation, then adjusts buyer targets for engine, transmission, and mechanical risk.`;

  if (brandTier === "premium") {
    analystNote = `This ${year} ${safeValue(vehicle.make)} ${safeValue(vehicle.model)} sits in a premium vehicle value band where condition, mileage, service history, and major maintenance exposure matter more heavily than on a mainstream equivalent. Buyer targets are adjusted downward when powertrain and mechanical risk increases.`;
  }

  if (fuelType === "electric") {
    analystNote = `This ${year} ${safeValue(vehicle.make)} ${safeValue(vehicle.model)} sits in an EV value band where battery confidence, charging hardware, software condition, and warranty position can materially affect buyer target pricing.`;
  }

  return {
    valuationDate: "March 2026",
    method: "Dynamic rules based valuation using brand tier, vehicle segment, drivetrain, fuel type, age bucket, and integrated engine, transmission, and mechanical risk",
    retailValues: {
      excellent: retailExcellent,
      good: retailGood,
      fair: retailFair
    },
    tradeValues: {
      excellent: tradeExcellent,
      good: tradeGood,
      fair: tradeFair
    },
    buyerTargetValues: {
      low: buyerLow,
      high: buyerHigh
    },
    classification: {
      brandTier,
      vehicleSegment,
      drivetrain,
      fuelType,
      ageBucket
    },
    pricingLogic: {
      segmentBase: roundToNearestHundred(segmentBase),
      brandTierMultiplier,
      drivetrainMultiplier,
      fuelTypeMultiplier,
      ageDepreciationMultiplier,
      preRiskMarketCenter: roundToNearestHundred(preRiskMarketCenter)
    },
    risks: {
      engineRiskScore,
      transmissionRiskScore,
      mechanicalRiskScore,
      weightedRiskScore,
      overallRiskBand,
      riskMultiplier
    },
    analystNote
  };
}

function buildEngineAdvisory(vehicle) {
  const make = upperText(vehicle.make);
  const model = safeValue(vehicle.model);
  const year = intValue(vehicle.year);
  const engineInfo = inferEnginePlatform(vehicle);

  if (make === "BMW" && year === 2016 && upperText(model).includes("320")) {
    return {
      title: "Split Year Engine Advisory",
      summary: "2016 was a transition year for some BMW four cylinder models. Engine architecture can meaningfully change long term ownership risk, buyer confidence, and maintenance exposure.",
      advisoryItems: [
        {
          heading: "Early Production Notes",
          body: "Earlier production examples may use the N20 architecture. Buyers often watch carefully for timing chain concern history, oil leak evidence, and proof of regular oil service."
        },
        {
          heading: "Later Production Notes",
          body: "Later production examples may use the newer B48 architecture, which is generally viewed as the stronger long term design, though cooling and gasket related maintenance still matters."
        },
        {
          heading: "Practical Check",
          body: "Use service records, build timing, and a physical inspection of the engine bay to confirm the exact engine architecture when this distinction matters to value or purchase confidence."
        }
      ]
    };
  }

  return {
    title: "Engine and Platform Advisory",
    summary: `${safeValue(vehicle.make)} ${safeValue(vehicle.model)} uses a ${engineInfo.enginePlatform} profile in this report. Buyers should focus on service history, known wear areas, and how the platform behaves on a cold start and test drive.`,
    advisoryItems: [
      {
        heading: "Known Ownership Theme",
        body: "This vehicle should be evaluated based on the engine family, maintenance history, and any signs of repeated deferred servicing."
      },
      {
        heading: "Later Life Note",
        body: "As vehicles age, cooling systems, seals, electronics, and suspension wear become more important than brochure specification alone."
      }
    ]
  };
}

function buildRiskForecast(vehicle, ownership, safety) {
    const engineRisk = String(vehicle.engineRiskLevel || "").toUpperCase();
  const drive = getDriveTypeGroup(vehicle);
  const body = getBodyType(vehicle);
  const fuel = getFuelGroup(vehicle);

  const items = [
    {
      area: "Cooling System",
      risk: isLuxuryBrand(vehicle.make) ? "High" : "Medium",
      note: "Cooling components become more failure prone with age, especially on turbocharged and luxury platforms.",
      estimatedCost: isLuxuryBrand(vehicle.make) ? "$900 to $1,500" : "$500 to $1,000"
    },
    {
      area: "Suspension Wear",
      risk: body === "suv" || drive === "awd" ? "Medium" : "Low",
      note: "Bushings, links, and control arms take more load as mileage increases, especially on heavier vehicles and all wheel drive systems.",
      estimatedCost: "$500 to $1,400"
    },
    {
      area: "Oil Leaks and Seals",
      risk: isLuxuryBrand(vehicle.make) ? "High" : "Medium",
      note: "Aging gaskets and seals frequently become a budget item on older vehicles, especially turbocharged examples.",
      estimatedCost: "$400 to $1,200"
    }
  ];

  if (engineRisk === "HIGHER") {
    items.unshift({
      area: "Engine Platform Related Risk",
      risk: "High",
      note: "This engine family carries a higher ownership risk profile, so engine inspection, service records, and leak or timing related checks should carry more weight in the next 24 months.",
      estimatedCost: "$800 to $3,500"
    });
  }

  if (engineRisk === "MODERATE") {
    items.unshift({
      area: "Engine Platform Related Risk",
      risk: "Medium",
      note: "This engine family is not automatically a problem, but engine platform and maintenance history should still influence inspection depth and ownership expectations.",
      estimatedCost: "$400 to $1,800"
    });
  }

  if (drive === "awd") {
    items.push({
      area: "All Wheel Drive System",
      risk: "Medium",
      note: "All wheel drive components add complexity and can become expensive when neglected or when tire sizes and tread depths are mismatched.",
      estimatedCost: "$800 to $3,500"
    });
  }

  if (fuel === "hybrid" || fuel === "electric") {
    items.push({
      area: "Electrified System Diagnostics",
      risk: "Medium",
      note: "Battery cooling, charging hardware, and control electronics deserve closer attention as the vehicle ages.",
      estimatedCost: "$500 to $4,000+"
    });
  }

  if (Number(safety.recalls || 0) >= 3) {
    items.push({
      area: "Recall Related Follow Up",
      risk: "Medium",
      note: "Multiple recall records increase the need to confirm completed remedies and verify service campaign history.",
      estimatedCost: "Varies by open remedy status"
    });
  }

  let summary = `${safeValue(vehicle.make)} ${safeValue(vehicle.model)} should be viewed as a vehicle where wear items, platform complexity, and past servicing all influence the next 24 months of ownership cost.`;

  if (engineRisk === "HIGHER") {
    summary = `${safeValue(vehicle.make)} ${safeValue(vehicle.model)} should be viewed as a vehicle where engine related ownership risk, wear items, platform complexity, and past servicing all influence the next 24 months of ownership cost.`;
  }

  if (engineRisk === "MODERATE") {
    summary = `${safeValue(vehicle.make)} ${safeValue(vehicle.model)} should be viewed as a vehicle where engine platform, wear items, platform complexity, and past servicing all influence the next 24 months of ownership cost.`;
  }

    return {
    title: "24 Month Risk Forecast",
    summary,
    items
  };
}

function buildNegotiationLeverage(vehicle, ownership, safety) {
    const engineRisk = String(vehicle.engineRiskLevel || "").toUpperCase();
  const items = [
    {
      title: "Maintenance History Credit",
      script: "Without strong service documentation, I have to assume I may be catching up on deferred maintenance, so I need room in the price for that risk."
    },
    {
      title: "Wear Item Credit",
      script: "Tires, brakes, suspension wear, and age related service items all affect immediate ownership cost, so I need to budget for those on day one."
    }
  ];

  if (ownership.maintenanceComplexity === "Higher") {
    items.push({
      title: "Platform Complexity Credit",
      script: "This is not a budget vehicle to own just because the purchase price is lower now. The platform carries higher maintenance exposure than a typical non luxury equivalent."
    });
  }

  if (Number(safety.recalls || 0) >= 3) {
    items.push({
      title: "Recall Follow Up Credit",
      script: "Since this vehicle profile shows multiple recall records, I need to verify remedy completion and leave room for any unresolved campaign related inconvenience."
    });
  }

    if (ownership.enginePlatform && ownership.enginePlatform !== "Manufacturer specific platform") {
    let engineScript = `This vehicle sits on the ${ownership.enginePlatform} platform, so I have to price in the known maintenance profile and the possibility of age related engine bay repairs.`;

    if (engineRisk === "HIGHER") {
      engineScript = `This vehicle sits on the ${ownership.enginePlatform} platform, and that engine profile carries higher ownership risk, so I need stronger room in the price for inspection findings, preventive work, and possible engine related repairs.`;
    }

    if (engineRisk === "MODERATE") {
      engineScript = `This vehicle sits on the ${ownership.enginePlatform} platform, so I still need room in the price for maintenance exposure, inspection findings, and possible age related engine bay repairs.`;
    }

    items.push({
      title: "Engine Platform Credit",
      script: engineScript
    });
  }

    let summary = "Use these talking points to frame the vehicle as one that may still be worth buying, but only at a price that respects upcoming ownership cost.";

  if (engineRisk === "HIGHER") {
    summary = "Use these talking points to frame the vehicle as one that may still be worth buying, but only at a price that reflects higher engine related ownership risk and possible catch up maintenance.";
  }

  if (engineRisk === "MODERATE") {
    summary = "Use these talking points to frame the vehicle as one that may still be worth buying, but only at a price that reflects engine platform exposure, age related maintenance, and inspection risk.";
  }

  return {
    title: "Negotiation Leverage",
    summary,
    items
  };
}

function buildOwnershipRoadmap(vehicle) {
  const fuel = getFuelGroup(vehicle);

  const intervals = [
    {
      interval: "Immediate",
      actions: [
        "Fresh oil and filter service",
        "Full fluid level check",
        "Brake and tire condition review"
      ]
    },
    {
      interval: "Next 5,000 Miles",
      actions: [
        "Inspect suspension wear items",
        "Review battery and charging system condition",
        "Inspect for fluid leaks"
      ]
    },
    {
      interval: "Next 10,000 Miles",
      actions: [
        "Spark plugs and ignition review where applicable",
        "Brake service review",
        "Alignment and tire wear check"
      ]
    },
    {
      interval: "Next 20,000 to 30,000 Miles",
      actions: [
        "Transmission service review where applicable",
        "Cooling system preventive inspection",
        "Drive belt and major rubber component inspection"
      ]
    }
  ];

  if (fuel === "electric") {
    intervals[1].actions.push("Check charging behavior and cable condition");
    intervals[2].actions.push("Inspect battery cooling system performance");
  }

  if (fuel === "hybrid") {
    intervals[1].actions.push("Inspect hybrid cooling and charging related systems");
  }

  return {
    title: "30,000 Mile Ownership Roadmap",
    summary: "This roadmap helps turn a vehicle from a short term purchase into a more predictable ownership experience.",
    intervals
  };
}

function buildPurchaseChecklist(vehicle, ownership) {
  const items = [
    "Cold start test and listen for unusual noises",
    "Check for warning lights before and after the drive",
    "Review service history and ownership paperwork",
    "Inspect tire condition and tread match",
    "Check for fluid leaks or signs of poor repairs"
  ];

  if (getDriveTypeGroup(vehicle) === "awd") {
    items.push("Perform a tight low speed turn and feel for binding or driveline shudder");
  }

  if (ownership.maintenanceComplexity === "Higher") {
    items.push("Confirm oil changes were done regularly rather than stretched too far");
  }

  return {
    title: "Final Purchase Checklist",
    items
  };
}

function buildAttentionFlags(report) {
  const flags = [];

  if (Number(report.safety.recalls || 0) >= 8) {
    flags.push("High recall activity");
  } else if (Number(report.safety.recalls || 0) >= 3) {
    flags.push("Moderate recall activity");
  }

  if (report.safety.dataAvailable && Number(report.safety.complaints || 0) >= 20) {
    flags.push("Meaningful complaint activity");
  } else if (report.safety.dataAvailable && Number(report.safety.complaints || 0) > 0) {
    flags.push("Complaint records present");
  }

  if (report.safety.topComponent) {
    flags.push(`Top complaint area: ${report.safety.topComponent}`);
  }

  if (report.investigations.items.length) {
    flags.push("Investigation history present");
  }

  if (!report.efficiency.combinedMPG) {
    flags.push("Fuel economy match unavailable");
  }

  if (report.ownership.maintenanceComplexity === "Higher") {
    flags.push("Higher maintenance platform");
  }

  if (report.ownership.enginePlatform) {
    flags.push(`Engine platform: ${report.ownership.enginePlatform}`);
  }

  return flags;
}

function buildRiskLevel(report) {
  let score = 0;

  const recalls = Number(report.safety.recalls || 0);
  const complaints = Number(report.safety.complaints || 0);
  const investigations = Array.isArray(report.investigations.items) ? report.investigations.items.length : 0;

  if (recalls >= 8) score += 3;
  else if (recalls >= 3) score += 2;
  else if (recalls > 0) score += 1;

  if (report.safety.dataAvailable) {
    if (complaints >= 20) score += 3;
    else if (complaints > 0) score += 1;
  }

  if (investigations >= 1) score += 1;
  if (report.ownership.maintenanceComplexity === "Higher") score += 1;
  if (!report.efficiency.combinedMPG) score += 1;

  if (score >= 6) return "High";
  if (score >= 3) return "Moderate";
  return "Low";
}

function buildConfidenceLevel(coverageScore) {
  if (coverageScore >= 80) return "High Confidence";
  if (coverageScore >= 60) return "Good Coverage";
  if (coverageScore >= 40) return "Partial Coverage";
  return "Limited Coverage";
}

function calculateCoverageScore(report) {
  let score = 0;

  if (report.vehicle.make && report.vehicle.model && report.vehicle.year) score += 25;
  if (typeof report.safety.recalls === "number") score += 15;
  if (report.safety.dataAvailable) score += 10;
  if (report.efficiency.dataAvailable) score += 15;
  if (report.ownership.commonIssues.length) score += 10;
  if (report.ownership.inspectionChecks.length) score += 10;
  if (report.ownership.enginePlatform) score += 5;
  if (report.investigations.items.length) score += 5;

  const dimensionsPresent = !!safeValue(report.specs.dimensions);
  const hpPresent = !!safeValue(report.specs.horsepower);

  if (dimensionsPresent) score += 3;
  if (hpPresent) score += 2;

  return Math.min(score, 100);
}

function buildFrontEndSignals(report) {
  const recalls = Number(report.safety.recalls || 0);
  const complaints = Number(report.safety.complaints || 0);

  let warningLevel = "low";
  let headline = "Vehicle profile looks typical";
  let subheadline = "No major public safety signals were detected.";
  let primaryConcern = "";
  let secondaryConcern = "";

  if (recalls >= 8) {
    warningLevel = "high";
    headline = "Potential ownership concerns detected";
    subheadline = "High recall activity was detected for this vehicle profile.";
    primaryConcern = "High recall activity";
  } else if (recalls >= 3) {
    warningLevel = "medium";
    headline = "Some ownership concerns detected";
    subheadline = "Moderate recall activity was detected for this vehicle profile.";
    primaryConcern = "Moderate recall activity";
  }

  if (report.safety.dataAvailable && complaints >= 20) {
    warningLevel = "high";
    headline = "Potential ownership concerns detected";
    subheadline = "Complaint activity was detected for this vehicle profile.";
    primaryConcern = "High complaint activity";
  }

  if (report.ownership.maintenanceComplexity === "Higher") {
    secondaryConcern = "Higher maintenance platform";
  }

  return {
    showWarning: warningLevel !== "low",
    warningLevel,
    headline,
    subheadline,
    primaryConcern,
    secondaryConcern,
    showUpsell: true,
    upsellReason: "Deeper damage, title, and ownership history checks remain hidden."
  };
}

function buildBuyerVerdict(report) {
  const riskLevel = report.signals.riskLevel;
  const recalls = Number(report.safety.recalls || 0);
  const complaints = Number(report.safety.complaints || 0);
  const topComponent = safeValue(report.safety.topComponent);
  const complexity = safeValue(report.ownership.maintenanceComplexity) || "Moderate";

  let headline = "Lower risk vehicle profile";
  let summary = "This vehicle profile shows fewer public risk signals than some alternatives, though any used vehicle should still be inspected carefully and supported by service history.";

  if (riskLevel === "High") {
    headline = "Proceed with caution";
    summary = `This vehicle profile shows elevated public risk signals. ${recalls} recall records and ${complaints} complaint records were found${topComponent ? `, with ${topComponent} appearing as the top complaint area` : ""}. Maintenance complexity is ${complexity.toLowerCase()}, so a careful inspection and strong service history matter more here than on a simpler platform.`;
  } else if (riskLevel === "Moderate") {
    headline = "Worth viewing, but inspect carefully";
    summary = `This vehicle profile shows some public risk signals. ${recalls} recall records and ${complaints} complaint records were found${topComponent ? `, with ${topComponent} appearing most often in complaint data` : ""}. Maintenance complexity is ${complexity.toLowerCase()}, so buyers should verify condition and maintenance before agreeing on price.`;
  }

  return {
    headline,
    summary
  };
}

function buildReportMeta(vehicle) {
  return {
    headline: "PRE PURCHASE INTELLIGENCE REPORT",
    stockId: buildStockId(vehicle),
    date: buildReportDateString()
  };
}

async function buildReportFromVin(vin) {
  const decodeUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`;
  const decodeResponse = await fetch(decodeUrl);

  if (!decodeResponse.ok) {
    throw new Error("VIN decode request failed");
  }

  const decodeData = await decodeResponse.json();

  if (!decodeData.Results || !decodeData.Results.length) {
    throw new Error("No VIN data found");
  }

  const row = decodeData.Results[0];

  const vehicle = {
    year: String(getCorrectedYear(vin, row)),
    make: safeValue(row.Make),
    model: safeValue(row.Model),
    trim: safeValue(row.Trim),
    engine: safeValue(row.EngineModel),
    fuel: safeValue(row.FuelTypePrimary),
    body: safeValue(row.BodyClass),
    drive: safeValue(row.DriveType),
    vin,
    wmi: safeValue(row.WMI),
    plantCountry: safeValue(row.PlantCountry),
    manufacturer: safeValue(row.Manufacturer),
    series: safeValue(row.Series)

  };

  vehicle.title = buildVehicleTitle(vehicle);

  const safetyRecalls = await fetchRecalls(vehicle.year, vehicle.make, vehicle.model);
  const safetyComplaints = await fetchComplaints(vehicle.year, vehicle.make, vehicle.model);
  const efficiency = await fetchEfficiency(vehicle.year, vehicle.make, vehicle.model);
  const investigationData = await fetchInvestigations(vehicle.year, vehicle.make, vehicle.model);
  const specs = buildSpecsFromDecode(row, vehicle);

  const safety = {
  ...safetyRecalls,
  ...safetyComplaints
};

const engineIntel = getEngineIntelligence(vehicle);
vehicle.enginePlatform = engineIntel.enginePlatform;
vehicle.engineConfidence = engineIntel.engineConfidence;
vehicle.engineSummary = engineIntel.engineSummary;

const transIntel = getTransmissionIntelligence(vehicle);
vehicle.transmissionType = transIntel.transmissionType;
vehicle.transmissionRisk = transIntel.transmissionRisk;
vehicle.transmissionSummary = transIntel.transmissionSummary;

const engineRisk = getEngineRiskProfile(vehicle.enginePlatform);
vehicle.engineRiskLevel = engineRisk.engineRiskLevel;
vehicle.engineRiskNote = engineRisk.engineRiskNote;

const mechanicalRisk = getMechanicalRisk(vehicle);
vehicle.mechanicalRiskLevel = mechanicalRisk.overallRisk;
vehicle.mechanicalRiskSummary = mechanicalRisk.summary;

const buyerProfile = getBuyerProfile(vehicle);
vehicle.buyerType = buyerProfile.buyerType;
vehicle.buyerSummary = buyerProfile.buyerSummary;
vehicle.buyerRiskExplanation = buyerProfile.explanation;
vehicle.buyerGuidance = buyerProfile.guidance;

const ownership = buildOwnershipIntelligence(vehicle, safety);
const optionProfile = buildOptionProfile(vehicle);
const marketAnalysis = buildMarketAnalysis(vehicle);
const engineAdvisory = buildEngineAdvisory(vehicle);
const riskForecast = buildRiskForecast(vehicle, ownership, safety);
const negotiationLeverage = buildNegotiationLeverage(vehicle, ownership, safety);
const ownershipRoadmap = buildOwnershipRoadmap(vehicle);
const purchaseChecklist = buildPurchaseChecklist(vehicle, ownership);

  const report = {
    reportMeta: buildReportMeta(vehicle),
    vehicle,
    safety,
    efficiency,
    specs,
    ownership,
    optionProfile,
    marketAnalysis,
    engineAdvisory,
    riskForecast,
    negotiationLeverage,
    ownershipRoadmap,
    purchaseChecklist,
    buyerVerdict: {
      headline: "",
      summary: ""
    },
    investigations: {
      items: investigationData.investigations,
      summary: investigationData.investigationSummary
    },
    signals: {
      coverageScore: 0,
      confidenceLevel: "",
      riskLevel: "",
      attentionFlags: [],
      allowPurchase: false
    },
    frontEndSummary: {
      headline: "",
      subheadline: ""
    },
    freeSignals: {},
    upsellTriggers: {
      historyAudit: true,
      titleCheck: true,
      damageCheck: true,
      ownershipCheck: true
    },
    locked: {
      historyAuditAvailable: true,
      damageRiskHidden: true,
      titleRiskHidden: true,
      ownershipRiskHidden: true,
      structuralRiskHidden: true
    }
  };

  report.signals.coverageScore = calculateCoverageScore(report);
  report.signals.confidenceLevel = buildConfidenceLevel(report.signals.coverageScore);
  report.signals.riskLevel = buildRiskLevel(report);
  report.signals.attentionFlags = buildAttentionFlags(report);
  report.signals.allowPurchase = report.signals.coverageScore >= 60;

  const frontSignals = buildFrontEndSignals(report);
  report.frontEndSummary.headline = frontSignals.headline;
  report.frontEndSummary.subheadline = frontSignals.subheadline;
  report.freeSignals = frontSignals;

let buyerVerdict = buildBuyerVerdict(report);

buyerVerdict = applyEngineRiskToVerdict(buyerVerdict, vehicle);
buyerVerdict = applyMechanicalRiskToVerdict(buyerVerdict, vehicle);

report.buyerVerdict = buyerVerdict;

  if (!report.vehicle.engine) {
    report.vehicle.engine = report.specs.engineDisplay;
  }

  if (!report.specs.transmission) {
    report.specs.transmission = upperText(report.vehicle.make) === "BMW"
      ? "8-Speed ZF Automatic"
      : "Automatic transmission configuration";
  }

  return report;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "VIN intelligence backend is running"
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "server.js confirmed" });
});

app.get("/api/decode/:vin", async (req, res) => {
  try {
    const vin = sanitizeVin(req.params.vin);

    if (vin.length !== 17) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 17 character VIN"
      });
    }

    const report = await buildReportFromVin(vin);

    res.json({
      success: true,
      vin,
      report
    });
  } catch (error) {
    console.error("Decode error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while decoding the VIN",
      error: String(error.message || error)
    });
  }
});

app.get("/api/checkout-test", (req, res) => {
  res.json({
    ok: true,
    message: "checkout test route is alive"
  });
});

async function handleCheckoutSession(req, res) {
  console.log("HIT CHECKOUT ROUTE");

  try {
    const vin = sanitizeVin(req.body?.vin);
    const sourcePage = req.body?.sourcePage || "";
    const pageTitle = req.body?.pageTitle || "";

    console.log("Incoming checkout request for VIN:", vin);
    console.log("Source page:", sourcePage);
    console.log("Page title:", pageTitle);
    console.log("Checkout route using price id:", JSON.stringify(process.env.STRIPE_VIN_REPORT_PRICE_ID));
    console.log("Checkout route using BASE_URL:", JSON.stringify(process.env.BASE_URL));
    console.log("Checkout route using API_BASE:", JSON.stringify(process.env.API_BASE));

    if (!vin || vin.length !== 17) {
      return res.status(400).json({ error: "Invalid VIN" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: process.env.STRIPE_VIN_REPORT_PRICE_ID,
          quantity: 1
        }
      ],
      success_url: `${process.env.API_BASE}/customer-report/${encodeURIComponent(vin)}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/cancel?vin=${encodeURIComponent(vin)}`,
      metadata: {
        vin,
        type: "vin_report",
        source_page: sourcePage,
        page_title: pageTitle
      }
    });

    console.log("Stripe session created:", session.id);

    return res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error full object:", err);

    return res.status(500).json({
      error: "Stripe failed",
      details: err && err.message ? err.message : String(err),
      priceIdUsed: process.env.STRIPE_VIN_REPORT_PRICE_ID,
      baseUrlUsed: process.env.BASE_URL,
      apiBaseUsed: process.env.API_BASE
    });
  }
}

app.post("/create-checkout-session", handleCheckoutSession);
app.post("/api/create-checkout-session", handleCheckoutSession);

app.get("/api/test", (req, res) => {
  res.json({
    ok: true,
    message: "Backend is working"
  });
});

app.get("/which-backend", (req, res) => {
  res.json({
    ok: true,
    backend: "server.js"
  });
});

app.get("/api/decode-test/:vin", async (req, res) => {
  try {
    let vin = (req.params.vin || "")
      .toString()
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    if (!vin) {
      return res.status(400).json({
        ok: false,
        error: "VIN is required"
      });
    }

    if (vin.length !== 17) {
      return res.status(400).json({
        ok: false,
        error: "VIN must be 17 characters"
      });
    }

    if (/[IOQ]/.test(vin)) {
      return res.status(400).json({
        ok: false,
        error: "VIN cannot contain I, O, or Q"
      });
    }

    const nhtsaUrl =
      "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/" +
      encodeURIComponent(vin) +
      "?format=json";

    const nhtsaRes = await fetch(nhtsaUrl, {
      headers: {
        Accept: "application/json"
      }
    });

    const nhtsaData = await nhtsaRes.json();
    const row =
      nhtsaData &&
      nhtsaData.Results &&
      nhtsaData.Results[0]
        ? nhtsaData.Results[0]
        : null;

    if (!row || (!row.Make && !row.Model)) {
      return res.status(400).json({
        ok: false,
        error: "We could not decode that VIN"
      });
    }

    return res.json({
      ok: true,
      vin,
      identity: {
        year: row.ModelYear || "",
        make: row.Make || "",
        model: row.Model || ""
      }
    });
  } catch (error) {
    console.error("decode-test error:", error);
    return res.status(500).json({
      ok: false,
      error: "Server error"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Backend intelligence server running on port " + PORT);
});
