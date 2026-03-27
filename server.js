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

  // BMW
  if (value.includes("N20")) {
    return {
      engineRiskLevel: "Higher",
      engineRiskNote: "This engine profile carries a higher ownership risk due to known timing chain, oil leak, and age related maintenance patterns."
    };
  }

  if (value.includes("N55")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This engine profile is generally known, but age, maintenance history, cooling system condition, and leak related issues still matter."
    };
  }

  if (value.includes("B48")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This engine profile is generally stronger than earlier alternatives, though cooling system, gasket, and service history still matter."
    };
  }

  if (value.includes("B58")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This engine profile is generally well regarded, but ownership cost can still rise quickly with neglected maintenance or cooling related issues."
    };
  }

  if (value.includes("S55") || value.includes("S58")) {
    return {
      engineRiskLevel: "Higher",
      engineRiskNote: "High performance engine platforms can carry significantly higher ownership and repair exposure, especially if servicing has been inconsistent."
    };
  }

  if (value.includes("N20 OR B48")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This vehicle sits in an engine transition window, so exact engine confirmation matters before assigning a firmer ownership risk profile."
    };
  }

  // VAG
  if (value.includes("EA888 HIGH OUTPUT")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This higher output EA888 profile is widely used and capable, but carbon buildup, water pump related issues, and strict maintenance history should be taken seriously."
    };
  }

  if (value.includes("EA888")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This turbocharged four cylinder profile is common and generally workable, but cooling system issues, oil consumption patterns, and carbon buildup can matter as mileage rises."
    };
  }

  if (value.includes("EA211")) {
    return {
      engineRiskLevel: "Low",
      engineRiskNote: "This smaller displacement modern gasoline engine profile is generally lower risk, though regular servicing and cooling system condition still matter."
    };
  }

  if (value.includes("3.0T V6")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This turbocharged six cylinder performance profile can be strong, but ownership cost, cooling related wear, and service history become more important than on a simpler four cylinder car."
    };
  }

  // Ford
  if (value.includes("2.7 ECOBOOST")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This EcoBoost profile offers strong performance, but turbocharged truck use, maintenance history, and cooling or oil related servicing should be reviewed carefully."
    };
  }

  if (value.includes("3.5 ECOBOOST")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This EcoBoost family is capable and common, but higher repair costs, timing related wear, and service history matter more than on a naturally aspirated alternative."
    };
  }

  if (value.includes("ECOBOOST")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This turbocharged Ford engine family can offer good performance and efficiency, but cooling, oil change discipline, and long term maintenance history matter."
    };
  }

  // GM
  if (value.includes("GM GEN V V8")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This GM V8 profile is widely used and generally understood, but lifter related concerns, active fuel management behavior, and maintenance quality should be reviewed closely."
    };
  }

  if (value.includes("GM TURBO GASOLINE")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This modern GM turbo gasoline profile can be efficient and usable, but turbo related wear, cooling issues, and service history remain important."
    };
  }

  // Toyota / Lexus
  if (value.includes("TOYOTA HYBRID SYNERGY DRIVE")) {
    return {
      engineRiskLevel: "Low",
      engineRiskNote: "This hybrid system profile is generally viewed as one of the more predictable long term ownership setups, though battery age, cooling, and maintenance history still matter."
    };
  }

  if (value.includes("TOYOTA TRUCK AND SUV GASOLINE")) {
    return {
      engineRiskLevel: "Low",
      engineRiskNote: "This body on frame Toyota gasoline profile is generally lower risk by segment standards, though mileage, towing use, and maintenance quality still matter."
    };
  }

  if (value.includes("TOYOTA LEXUS HYBRID")) {
    return {
      engineRiskLevel: "Low",
      engineRiskNote: "This Toyota Lexus hybrid profile is generally considered a lower risk ownership setup, though battery age, cooling system condition, and service record still matter."
    };
  }

  if (value.includes("TOYOTA LEXUS GASOLINE")) {
    return {
      engineRiskLevel: "Low",
      engineRiskNote: "This Toyota Lexus gasoline profile is generally favorable, though service history, leak checks, and condition still matter with age."
    };
  }

  // Honda / Acura
  if (value.includes("HONDA HYBRID")) {
    return {
      engineRiskLevel: "Low",
      engineRiskNote: "This Honda hybrid profile is generally favorable, though battery age, software updates, and maintenance record should still be checked."
    };
  }

  if (value.includes("HONDA EARTH DREAMS")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This engine family is common and usually manageable, but oil dilution concerns in some applications, turbocharged versions, and maintenance history should be considered."
    };
  }

  if (value.includes("HONDA ACURA MODERN GASOLINE")) {
    return {
      engineRiskLevel: "Low",
      engineRiskNote: "This Honda Acura gasoline profile is generally solid, though service history, fluid maintenance, and age related wear still matter."
    };
  }

  // Nissan / Infiniti
  if (value.includes("NISSAN MODERN GASOLINE")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This Nissan gasoline profile is usually less concerning than the transmission side, but maintenance history, oil servicing, and cooling condition still matter."
    };
  }

  if (value.includes("INFINITI NISSAN MODERN GASOLINE")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This Infiniti Nissan gasoline profile can be perfectly usable, but premium ownership cost and maintenance history should be taken seriously."
    };
  }

  // Mercedes
  if (value.includes("M274") || value.includes("M264")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This modern Mercedes turbo four profile can be workable, but maintenance discipline, cooling system condition, and electronics related ownership costs matter."
    };
  }

  if (value.includes("MERCEDES TURBOCHARGED SIX CYLINDER")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This Mercedes six cylinder profile offers strong performance, but repair costs and maintenance exposure can be meaningfully higher than average."
    };
  }

  // Volvo
  if (value.includes("VOLVO DRIVE E HYBRID")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This hybridized Drive E profile can be efficient and advanced, but complexity is higher, so battery system health, software behavior, and service history matter."
    };
  }

  if (value.includes("VOLVO DRIVE E")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This Volvo Drive E profile is modern and efficient, but turbocharged four cylinder complexity, cooling health, and maintenance quality still matter."
    };
  }

  // Hyundai / Kia
  if (value.includes("KIA HYBRID") || value.includes("HYUNDAI HYBRID")) {
    return {
      engineRiskLevel: "Low",
      engineRiskNote: "This modern hybrid profile is generally favorable for mainstream ownership, though battery age, software updates, and service history should still be checked."
    };
  }

  if (value.includes("KIA MODERN GASOLINE") || value.includes("HYUNDAI MODERN GASOLINE")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This mainstream gasoline engine family can be workable, but exact engine generation, oil service history, and known campaign exposure should be reviewed carefully."
    };
  }

  // Stellantis
  if (value.includes("PENTASTAR OR HEMI")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This Chrysler performance or utility profile can be durable, but ownership cost, fuel use, and maintenance quality matter more heavily as mileage increases."
    };
  }

  if (value.includes("JEEP CHRYSLER MODERN GASOLINE")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This Jeep Chrysler gasoline profile is common, but cooling system health, oil leaks, and service history should still guide the buying decision."
    };
  }

  if (value.includes("RAM CHRYSLER TRUCK POWERTRAIN")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This truck powertrain family can be capable, but towing history, diesel or heavy duty use, and maintenance discipline should be taken seriously."
    };
  }

  // Subaru
  if (value.includes("SUBARU BOXER")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This Subaru boxer profile is distinctive and widely used, but oil consumption patterns, gasket history, and CVT pairing should still be reviewed carefully."
    };
  }

  // Mazda
  if (value.includes("SKYACTIV")) {
    return {
      engineRiskLevel: "Low",
      engineRiskNote: "This Mazda Skyactiv profile is generally viewed favorably, though routine maintenance and condition still matter like any used vehicle."
    };
  }

  // Porsche
  if (value.includes("PORSCHE MODERN GASOLINE")) {
    return {
      engineRiskLevel: "Moderate",
      engineRiskNote: "This Porsche performance profile may be desirable, but parts cost, service history, and specialist maintenance exposure are higher than average."
    };
  }

  // JLR
  if (value.includes("JAGUAR LAND ROVER MODERN GASOLINE")) {
    return {
      engineRiskLevel: "Higher",
      engineRiskNote: "This Jaguar Land Rover gasoline profile can carry meaningfully higher ownership risk due to complexity, electronics exposure, and expensive repair pathways."
    };
  }

  // Tesla
  if (value.includes("TESLA ELECTRIC DRIVE UNIT")) {
    return {
      engineRiskLevel: "Low",
      engineRiskNote: "This electric drive unit profile removes many conventional engine failure points, though battery, charging hardware, and software condition still matter."
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
      buyerType: "",
      buyerSummary: "Suitable for buyers looking for predictable ownership with fewer surprises.",
      explanation: "Low means this vehicle does not show strong public risk signals across engine, transmission, or complaint data. That does not mean risk is zero, but it suggests a more predictable ownership profile where standard inspection and maintenance checks are usually sufficient.",
      guidance: "Focus on condition, mileage, and service history, but overall ownership risk is lower than average."
    };
  }

  if (risk === "MODERATE") {
    return {
      buyerType: "",
      buyerSummary: "Suitable for buyers comfortable managing some risk in exchange for value or spec.",
      explanation: "Moderate means this vehicle shows some risk signals either in engine platform, transmission type, or ownership patterns. This does not automatically make it a bad buy, but it does mean service history, inspection quality, and price become more important to get right.",
      guidance: "Prioritize inspection quality, confirm maintenance history, and ensure the price reflects the risk profile."
    };
  }

  if (risk === "HIGHER") {
    return {
      buyerType: "",
      buyerSummary: "Better suited to experienced buyers or those prepared for higher ownership costs.",
      explanation: "Higher means this vehicle shows stronger risk signals in key areas such as engine platform, transmission profile, or complaint history. This does not automatically mean you should avoid it, but it does mean inspection depth, mechanical condition, and price negotiation should carry significantly more weight before making a decision.",
      guidance: "Only proceed with strong inspection results, clear service history, and a price that reflects potential repair exposure."
    };
  }

  return {
    buyerType: "",
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

function clampProbability(value) {
  return Math.max(12, Math.min(95, Math.round(value)));
}

function getOptionLabelSet(make) {
  const brand = upperText(make);

  const labelSets = {
    BMW: {
      sport: "M Sport Package",
      comfort: "Premium Package",
      tech: "Technology Package",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Tow or Utility Package",
      efficiency: "Efficiency Package"
    },
    AUDI: {
      sport: "S line / Black Optics",
      comfort: "Premium Interior",
      tech: "Technology Package",
      weather: "Cold Weather Package ",
      audio: "Premium Audio",
      utility: "Tow or Utility Package",
      efficiency: "Efficiency Package"
    },
    "MERCEDES-BENZ": {
      sport: "AMG Line / Night Package",
      comfort: "Premium Package",
      tech: "Driver Assistance Package",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Tow or Utility Package ",
      efficiency: "Efficiency Package"
    },
    MERCEDES: {
      sport: "AMG Line / Night Package",
      comfort: "Premium Package",
      tech: "Driver Assistance Package",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Tow or Utility Package",
      efficiency: "Efficiency Package"
    },
    LEXUS: {
      sport: "F Sport Package",
      comfort: "Luxury Package",
      tech: "Navigation / Safety Package",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Tow or Utility Package",
      efficiency: "Hybrid Efficiency"
    },
    ACURA: {
      sport: "A Spec",
      comfort: "Advance / Luxury",
      tech: "Technology Package",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Utility Package",
      efficiency: "Efficiency Package"
    },
    INFINITI: {
      sport: "Sport Appearance",
      comfort: "Luxury Package",
      tech: "Technology Package",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Utility Package",
      efficiency: "Efficiency Package"
    },
    CADILLAC: {
      sport: "Sport / Performance",
      comfort: "Luxury Package",
      tech: "Driver Assistance Package",
      weather: "Cold Weather Package ",
      audio: "Premium Audio",
      utility: "Tow / Utility Package",
      efficiency: "Efficiency Package"
    },
    GENESIS: {
      sport: "Sport Prestige",
      comfort: "Prestige / Luxury",
      tech: "Technology Package",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Utility Package",
      efficiency: "Efficiency Package"
    },
    PORSCHE: {
      sport: "Sport Chrono / Performance",
      comfort: "Premium Comfort",
      tech: "Technology Package",
      weather: "Cold Weather Package ",
      audio: "Premium Audio",
      utility: "Tow / Utility Package ",
      efficiency: "Hybrid Efficiency"
    },
    VOLVO: {
      sport: "R Design / Black Edition",
      comfort: "Luxury / Lounge",
      tech: "Advanced Safety Package",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Tow / Utility Package",
      efficiency: "Recharge / Efficiency"
    },
    TOYOTA: {
      sport: "Sport Appearance",
      comfort: "Premium / Convenience",
      tech: "Technology / Safety",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Tow / Utility Package",
      efficiency: "Hybrid Efficiency"
    },
    HONDA: {
      sport: "Sport Appearance",
      comfort: "EX-L / Touring Comfort",
      tech: "Technology Package",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Utility Package",
      efficiency: "Hybrid Efficiency"
    },
    NISSAN: {
      sport: "Sport Appearance",
      comfort: "Premium Package",
      tech: "Technology Package",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Tow / Utility Package",
      efficiency: "Efficiency Package"
    },
    HYUNDAI: {
      sport: "N Line / Sport Appearance",
      comfort: "Limited / Luxury",
      tech: "Technology Package",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Tow / Utility Package",
      efficiency: "Hybrid / EV Efficiency"
    },
    KIA: {
      sport: "GT Line / Sport Appearance",
      comfort: "Premium / Luxury",
      tech: "Technology Package",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Tow / Utility Package",
      efficiency: "Hybrid / EV Efficiency"
    },
    FORD: {
      sport: "Sport Appearance / FX",
      comfort: "Luxury / Comfort",
      tech: "Technology / Co Pilot",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Tow / Utility Package",
      efficiency: "Hybrid / EV Efficiency"
    },
    CHEVROLET: {
      sport: "RS / Sport Appearance",
      comfort: "Premium / Convenience",
      tech: "Technology / Driver Assist",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Tow / Utility Package",
      efficiency: "EV / Efficiency"
    },
    GMC: {
      sport: "Sport / AT4 Appearance",
      comfort: "Premium / Luxury",
      tech: "Technology / Driver Assist",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Tow / Utility Package",
      efficiency: "Efficiency Package"
    },
    JEEP: {
      sport: "Sport / Appearance",
      comfort: "Luxury Group",
      tech: "Technology Group",
      weather: "Cold Weather Group",
      audio: "Premium Audio",
      utility: "Tow / Off Road Group",
      efficiency: "4xe Efficiency"
    },
    RAM: {
      sport: "Sport Appearance",
      comfort: "Luxury / Laramie",
      tech: "Technology / Safety",
      weather: "Cold Weather Group",
      audio: "Premium Audio",
      utility: "Tow Package",
      efficiency: "Efficiency Package"
    },
    DODGE: {
      sport: "Performance / Appearance",
      comfort: "Premium Interior",
      tech: "Technology Group",
      weather: "Cold Weather Group",
      audio: "Premium Audio",
      utility: "Tow / Utility",
      efficiency: "Efficiency Package"
    },
    SUBARU: {
      sport: "Sport / Wilderness",
      comfort: "Limited / Touring",
      tech: "Technology / EyeSight",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Tow / Utility",
      efficiency: "Efficiency Package"
    },
    MAZDA: {
      sport: "Sport Appearance",
      comfort: "Premium / Signature",
      tech: "Technology Package",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Tow / Utility",
      efficiency: "Efficiency Package"
    },
    VOLKSWAGEN: {
      sport: "R Line / Sport",
      comfort: "Premium Comfort",
      tech: "Technology Package",
      weather: "Cold Weather Package",
      audio: "Premium Audio",
      utility: "Tow / Utility",
      efficiency: "Efficiency Package"
    },
    TESLA: {
      sport: "Performance Upgrade",
      comfort: "Premium Interior",
      tech: "Autopilot / Tech",
      weather: "Cold Weather",
      audio: "Premium Audio",
      utility: "Tow Package",
      efficiency: "Range / Efficiency"
    }
  };

  return labelSets[brand] || {
    sport: "Sport / Appearance Package",
    comfort: "Comfort / Luxury Package",
    tech: "Technology / Driver Assist",
    weather: "Cold Weather Package",
    audio: "Premium Audio",
    utility: "Tow / Utility Package",
    efficiency: "Efficiency Package"
  };
}

function buildOptionProfile(vehicle) {
  const make = upperText(vehicle.make);
  const model = upperText(vehicle.model);
  const trim = upperText(vehicle.trim);
  const body = getBodyType(vehicle);
  const drive = getDriveTypeGroup(vehicle);
  const fuel = getFuelGroup(vehicle);
  const year = intValue(vehicle.year) || 0;
  const engine = upperText(vehicle.engine);
  const labels = getOptionLabelSet(make);

  let sportScore = 26;
  let comfortScore = 34;
  let techScore = 36;
  let weatherScore = 22;
  let audioScore = 24;
  let utilityScore = 18;
  let efficiencyScore = 14;

  if (year >= 2019) techScore += 14;
  if (year >= 2021) techScore += 6;
  if (year >= 2018) comfortScore += 4;

  if (body === "coupe" || body === "convertible") {
    sportScore += 18;
    comfortScore += 2;
  }

  if (body === "suv") {
    comfortScore += 10;
    utilityScore += 10;
  }

  if (body === "truck") {
    utilityScore += 20;
    comfortScore += 4;
  }

  if (body === "wagon" || body === "hatchback") {
    utilityScore += 8;
  }

  if (drive === "awd") {
    comfortScore += 4;
    weatherScore += 10;
    utilityScore += 6;
  }

  if (fuel === "hybrid") {
    techScore += 8;
    efficiencyScore += 26;
  }

  if (fuel === "electric") {
    techScore += 16;
    efficiencyScore += 34;
  }

  if (fuel === "diesel") {
    utilityScore += 10;
  }

  if (trim.includes("SPORT") || trim.includes("S LINE") || trim.includes("R LINE") || trim.includes("AMG") || trim.includes("M SPORT") || trim.includes("F SPORT") || trim.includes("A-SPEC") || trim.includes("N LINE") || trim.includes("GT LINE") || trim.includes("RS")) {
    sportScore += 24;
  }

  if (trim.includes("BLACK") || trim.includes("OPTICS") || trim.includes("NIGHT")) {
    sportScore += 14;
  }

  if (trim.includes("LIMITED") || trim.includes("PREMIUM") || trim.includes("LUXURY") || trim.includes("PLATINUM") || trim.includes("SIGNATURE") || trim.includes("TOURING") || trim.includes("PRESTIGE") || trim.includes("ADVANCE")) {
    comfortScore += 22;
  }

  if (trim.includes("TECH") || trim.includes("TECHNOLOGY") || trim.includes("ELITE") || trim.includes("PRESTIGE") || trim.includes("ADVANCED") || trim.includes("NAV")) {
    techScore += 20;
  }

  if (trim.includes("COLD WEATHER") || trim.includes("WINTER")) {
    weatherScore += 24;
  }

  if (trim.includes("BOSE") || trim.includes("BANG") || trim.includes("HARMAN") || trim.includes("MARK LEVINSON") || trim.includes("BURMESTER") || trim.includes("BOWERS") || trim.includes("REVEL")) {
    audioScore += 24;
  }

  if (trim.includes("TOW") || trim.includes("TRAILER") || trim.includes("OFF ROAD") || trim.includes("WILDERNESS") || trim.includes("AT4") || trim.includes("TRD") || trim.includes("4X4")) {
    utilityScore += 26;
  }

  if (trim.includes("HYBRID") || trim.includes("PHEV") || trim.includes("PLUGIN") || trim.includes("ELECTRIC") || trim.includes("EV") || trim.includes("RECHARGE") || trim.includes("4XE")) {
    efficiencyScore += 24;
  }

  if (model.includes("M") || model.includes("S") || model.includes("RS") || model.includes("ST") || model.includes("TYPE R") || model.includes("GTI") || model.includes("GOLF R") || model.includes("WRX") || model.includes("HELLCAT") || model.includes("SCAT")) {
    sportScore += 8;
  }

  if (engine.includes("3.0") || engine.includes("3.5") || engine.includes("4.0") || engine.includes("V6") || engine.includes("V8")) {
    sportScore += 4;
    utilityScore += 4;
  }

  return {
    sport: {
      label: labels.sport,
      probability: clampProbability(sportScore)
    },
    comfort: {
      label: labels.comfort,
      probability: clampProbability(comfortScore)
    },
    tech: {
      label: labels.tech,
      probability: clampProbability(techScore)
    },
    weather: {
      label: labels.weather,
      probability: clampProbability(weatherScore)
    },
    audio: {
      label: labels.audio,
      probability: clampProbability(audioScore)
    },
    utility: {
      label: labels.utility,
      probability: clampProbability(utilityScore)
    },
    efficiency: {
      label: labels.efficiency,
      probability: clampProbability(efficiencyScore)
    }
  };
}

function getTopOptionProfileItems(optionProfile, limit = 3) {
  return Object.entries(optionProfile)
    .map(([key, value]) => ({
      key,
      label: value.label,
      probability: value.probability
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, limit);
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

function getVehicleAgeBucket(year) {
  // your existing code (leave this untouched)
}

function getAgeBucketLabel(ageBucket) {
  const labels = {
    "0_1": "newer vehicle value window",
    "2_3": "2 to 3 year value window",
    "4_5": "4 to 5 year value window",
    "6_8": "6 to 8 year value window",
    "9_12": "9 to 12 year value window",
    "13_plus": "13 year plus value window"
  };

  return labels[ageBucket] || "used vehicle value window";
}

function getFuelGroupForMarket(vehicle) {
  const value = String(vehicle.fuel || "").trim().toUpperCase();

  if (value.includes("DIESEL")) return "diesel";
  if (value.includes("PLUG") || value.includes("PHEV")) return "phev";
  if (value.includes("HYBRID")) return "hybrid";
  if (value.includes("ELECTRIC") || value === "EV") return "electric";
  return "gasoline";
}

function roundToNearestHundred(value) {
  return Math.round(Number(value || 0) / 100) * 100;
}

function numberWithCommas(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundToNearestHundred(value) {
  return Math.round(Number(value || 0) / 100) * 100;
}

function normalizeMake(make = "") {
  return String(make).trim().toLowerCase();
}

function getBrandTier(make = "") {
  const normalized = normalizeMake(make);

  const tiers = {
    exotic: ["ferrari", "lamborghini", "mclaren", "bugatti", "pagani", "koenigsegg"],
    ultraLuxury: ["rolls-royce", "rolls royce", "bentley", "maybach"],
    luxury: ["porsche", "mercedes-benz", "mercedes", "bmw", "audi", "lexus", "jaguar", "land rover", "range rover", "maserati", "aston martin"],
    premium: ["acura", "infiniti", "genesis", "volvo", "alfa romeo", "cadillac", "lincoln"],
    mainstream: ["toyota", "honda", "ford", "chevrolet", "chevy", "nissan", "hyundai", "kia", "subaru", "mazda", "volkswagen", "vw", "gmc", "ram", "jeep"],
    budget: ["mitsubishi", "chrysler", "dodge", "fiat", "smart"]
  };

  for (const [tier, makes] of Object.entries(tiers)) {
    if (makes.includes(normalized)) return tier;
  }

  return "mainstream";
}

function normalizeFuelType(vehicle = {}) {
  const raw = String(vehicle.fuel || "").toLowerCase();

  if (raw.includes("plug") || raw.includes("phev")) return "phev";
  if (raw.includes("hybrid")) return "hybrid";
  if (raw.includes("electric") || raw === "ev" || raw.includes("bev")) return "ev";
  if (raw.includes("diesel")) return "diesel";
  if (raw.includes("gas") || raw.includes("petrol")) return "gasoline";

  return "other";
}

function getVehicleSegmentForPricing(vehicle = {}) {
  const body = String(vehicle.body || "").toLowerCase();
  const model = String(vehicle.model || "").toLowerCase();
  const make = String(vehicle.make || "").toLowerCase();

  if (body.includes("pickup") || body.includes("truck")) return "truck";
  if (body.includes("minivan")) return "minivan";
  if (body.includes("van")) return "van";
  if (body.includes("wagon")) return "wagon";
  if (body.includes("hatch")) return "hatchback";
  if (body.includes("convertible") || body.includes("cabrio") || body.includes("roadster") || body.includes("spider")) return "convertible";
  if (body.includes("coupe")) return "coupe";
  if (body.includes("crossover") || body.includes("cuv")) return "crossover";
  if (body.includes("sport utility") || body.includes("utility") || body.includes("suv")) return "suv";
  if (body.includes("sedan") || body.includes("saloon")) return "sedan";

  if (["ferrari", "lamborghini", "mclaren", "bugatti", "pagani", "koenigsegg"].includes(make)) return "exoticSports";

  if (
    model.includes("corvette") ||
    model.includes("911") ||
    model.includes("boxster") ||
    model.includes("cayman") ||
    model.includes("supra") ||
    model.includes("gt-r") ||
    model.includes("gtr")
  ) {
    return "sports";
  }

  return "sedan";
}

function getVehicleAgeBucket(year) {
  const age = Math.max(0, 2026 - safeNumber(year, 2026));

  if (age <= 1) return "0_1";
  if (age <= 3) return "2_3";
  if (age <= 5) return "4_5";
  if (age <= 8) return "6_8";
  if (age <= 12) return "9_12";
  return "13_plus";
}

function getAgeBucketLabel(ageBucket) {
  const labels = {
    "0_1": "newer vehicle value window",
    "2_3": "2 to 3 year value window",
    "4_5": "4 to 5 year value window",
    "6_8": "6 to 8 year value window",
    "9_12": "9 to 12 year value window",
    "13_plus": "13 year plus value window"
  };

  return labels[ageBucket] || "used vehicle value window";
}

function buildAnalystNote({
  year,
  make,
  model,
  ageBucket,
  brandTier,
  vehicleSegment,
  fuelType,
  engineRiskLevel,
  transmissionRisk,
  mechanicalRiskLevel
}) {
  const ageBucketLabel = getAgeBucketLabel(ageBucket);
  const vehicleName = `${year} ${make} ${model}`.replace(/\s+/g, " ").trim();

  const engineRisk = String(engineRiskLevel || "").toUpperCase();
  const transmission = String(transmissionRisk || "").toUpperCase();
  const mechanical = String(mechanicalRiskLevel || "").toUpperCase();

  let opening = `This ${vehicleName} sits in the ${ageBucketLabel}.`;
  let middle = `Depreciation has already done much of the heavy lifting, but condition, maintenance history, and platform risk still have a major effect on what it is worth.`;
  let closing = `Buyer targets should be shaped by engine, transmission, and wider mechanical exposure rather than seller optimism alone.`;

  if (brandTier === "exotic") {
    middle = `Exotic cars in this age range can still hold strong money, but only when condition, originality, service records, and buyer confidence all line up properly.`;
    closing = `For a car like this, pricing discipline still matters because even strong halo cars can vary widely based on history and upkeep.`;
  } else if (brandTier === "ultraLuxury") {
    middle = `Ultra luxury vehicles in this age range can still command serious money, but repair exposure, electronics complexity, and upkeep standards have a direct effect on market confidence.`;
    closing = `The right price needs to reflect both prestige and the real cost of keeping a vehicle like this in strong condition.`;
  } else if (brandTier === "luxury") {
    middle = `Luxury vehicles in this age range are usually judged less by badge appeal alone and more by service history, mechanical condition, and how expensive the next round of ownership is likely to be.`;
    closing = `Buyer targets should leave room for maintenance exposure rather than tracking dealer asking prices too closely.`;
  } else if (brandTier === "premium") {
    middle = `Premium vehicles in this age range can still make sense, but they need stronger condition and better paperwork than a simpler mainstream alternative to justify stronger money.`;
    closing = `The right number should reflect maintenance exposure, not just the badge and spec sheet.`;
  } else if (brandTier === "budget") {
    middle = `At this point in the age curve, value is usually driven more by present condition and deferred maintenance than by brand positioning.`;
    closing = `Buyer targets should stay grounded in repair reality and not assume a cheap asking price automatically means good value.`;
  }

  if (fuelType === "ev") {
    middle = `For an EV in the ${ageBucketLabel}, battery confidence, charging performance, software stability, and warranty position can move buyer confidence more than a conventional engine profile would.`;
    closing = `The right price should reflect battery and systems confidence, not just age and mileage.`;
  } else if (fuelType === "hybrid" || fuelType === "phev") {
    middle = `Electrified vehicles in this age range are usually judged on battery health, cooling behavior, warning free operation, and service history as much as on normal age based depreciation.`;
    closing = `Buyer targets should leave room for hybrid system uncertainty where records or inspection results are not strong.`;
  } else if (vehicleSegment === "truck") {
    middle = `Truck values in this age range often stay firmer than passenger cars, but use history, towing exposure, suspension wear, and maintenance quality still drive the real number.`;
    closing = `Buyer targets should reflect how this truck has actually been used, not just its reputation for holding value.`;
  } else if (vehicleSegment === "suv" || vehicleSegment === "crossover") {
    middle = `SUV values in this age range often stay relatively supported, but driveline wear, suspension condition, and maintenance history still have a strong effect on what makes sense.`;
    closing = `Buyer targets should stay tied to condition and ownership exposure, not just segment popularity.`;
  } else if (vehicleSegment === "sports" || vehicleSegment === "exoticSports" || vehicleSegment === "coupe" || vehicleSegment === "convertible") {
    middle = `Performance oriented vehicles in this age range can hold value differently from ordinary cars, but service quality, mechanical confidence, and evidence of careful ownership matter heavily.`;
    closing = `The right number should reflect both desirability and the cost of getting a weak example back into shape.`;
  }

  if (mechanical === "HIGHER") {
    closing = `Because the wider mechanical picture sits in a higher risk band, the price should leave real room for inspection findings and follow on repairs.`;
  } else if (engineRisk === "HIGHER" && transmission === "HIGHER") {
    closing = `With both engine and transmission risk sitting on the stronger side, buyer targets should stay conservative and heavily inspection led.`;
  } else if (engineRisk === "HIGHER") {
    closing = `Because engine side risk is elevated here, buyer targets should be more cautious than the headline market alone might suggest.`;
  } else if (transmission === "HIGHER") {
    closing = `Because transmission exposure is elevated here, buyer targets should leave more room than a clean retail comparison alone would imply.`;
  } else if (mechanical === "LOW" && engineRisk === "LOW" && transmission === "LOW") {
    closing = `With the core risk picture looking more manageable than average, stronger examples can justify firmer pricing, but inspection and paperwork still matter.`;
  }

  return `${opening} ${middle} ${closing}`.replace(/\s+/g, " ").trim();
}

function estimateBaseMSRP(vehicle = {}) {
  const brandTier = getBrandTier(vehicle.make || "");
  const segment = getVehicleSegmentForPricing(vehicle);
  const year = safeNumber(vehicle.year, 2026);

  const baseMsrpMap = {
    exotic: {
      exoticSports: 260000,
      sports: 210000,
      coupe: 190000,
      convertible: 230000,
      sedan: 180000,
      suv: 320000
    },
    ultraLuxury: {
      sedan: 185000,
      suv: 210000,
      coupe: 175000,
      convertible: 195000
    },
    luxury: {
      sedan: 65000,
      suv: 72000,
      crossover: 58000,
      coupe: 70000,
      convertible: 78000,
      sports: 105000
    },
    premium: {
      sedan: 44000,
      suv: 50000,
      crossover: 42000,
      coupe: 46000,
      sports: 62000
    },
    mainstream: {
      sedan: 30000,
      suv: 39000,
      crossover: 34000,
      coupe: 32000,
      hatchback: 26000,
      wagon: 32000,
      truck: 42000,
      minivan: 41000,
      van: 43000,
      sports: 52000,
      convertible: 39000
    },
    budget: {
      sedan: 24000,
      suv: 30000,
      crossover: 27000,
      hatchback: 22000,
      truck: 34000,
      minivan: 33000,
      van: 34000
    }
  };

  const tierMap = baseMsrpMap[brandTier] || baseMsrpMap.mainstream;
  let msrp = tierMap[segment] || tierMap.sedan || 30000;

  if (year >= 2023) msrp *= 1.08;
  else if (year >= 2019) msrp *= 1.03;
  else if (year <= 2010) msrp *= 0.92;

  return Math.round(msrp);
}

function getBaseDepreciationRate(vehicle = {}) {
  const fuelType = normalizeFuelType(vehicle);
  const segment = getVehicleSegmentForPricing(vehicle);
  const tier = getBrandTier(vehicle.make || "");

  const defaultRates = {
    gasoline: 0.07,
    diesel: 0.06,
    hybrid: 0.08,
    phev: 0.09,
    ev: 0.11,
    other: 0.07
  };

  let rate = defaultRates[fuelType] || 0.07;

  if (segment === "truck") rate -= 0.02;
  if (segment === "suv") rate -= 0.01;
  if (segment === "sports") rate -= 0.02;
  if (segment === "exoticSports") rate = 0.035;
  if (segment === "minivan") rate += 0.01;

  if (tier === "exotic") rate = Math.min(rate, 0.035);
  if (tier === "ultraLuxury") rate = Math.min(rate, 0.055);

  return clamp(rate, 0.02, 0.22);
}

function getDepreciatedBaseValue(msrp, year, depRate) {
  const age = Math.max(0, 2026 - safeNumber(year, 2026));

  if (age === 0) return msrp * 0.93;
  if (age === 1) return msrp * 0.82;

  const postYearOneValue = msrp * 0.82;
  const remainingYears = Math.max(0, age - 1);

  return postYearOneValue * Math.pow(1 - depRate, remainingYears);
}

function getMinimumReasonableValue(vehicle = {}, msrp = 0) {
  const year = intValue(vehicle.year) || 2018;
  const make = safeValue(vehicle.make).toLowerCase();
  const age = new Date().getFullYear() - year;

  // Base % floors by tier
  let minPercent = 0.10; // default fallback

  if (make.includes("ferrari") || make.includes("lamborghini") || make.includes("mclaren")) {
    minPercent = 0.45; // exotic cars hold value hard
  } else if (make.includes("porsche")) {
    minPercent = 0.35;
  } else if (make.includes("bmw") || make.includes("mercedes") || make.includes("audi")) {
    minPercent = 0.20;
  } else if (make.includes("tesla")) {
    minPercent = 0.25;
  } else {
    minPercent = 0.15; // mainstream
  }

  // Age-based adjustment
  if (age > 15) minPercent *= 0.7;
  if (age > 20) minPercent *= 0.5;

  const floor = msrp * minPercent;

  // Absolute minimum sanity floor
  return Math.max(floor, 5000);
}

function applyBrandTierAdjustment(value, make = "") {
  const tier = getBrandTier(make);

  const multipliers = {
    exotic: 1.35,
    ultraLuxury: 1.22,
    luxury: 1.10,
    premium: 1.04,
    mainstream: 1.00,
    budget: 0.92
  };

  return value * (multipliers[tier] || 1);
}

function applySegmentMarketAdjustment(value, vehicle = {}) {
  const segment = getVehicleSegmentForPricing(vehicle);

  const multipliers = {
    truck: 1.08,
    suv: 1.04,
    crossover: 1.01,
    sports: 1.10,
    coupe: 1.03,
    sedan: 0.97,
    hatchback: 0.96,
    wagon: 0.98,
    minivan: 0.92,
    van: 0.94,
    convertible: 1.05,
    exoticSports: 1.18
  };

  return value * (multipliers[segment] || 1);
}

function getRiskDeductionPercent(vehicle = {}) {
  let deduction = 0;

  const engine = String(vehicle.engineRiskLevel || "").toUpperCase();
  const transmission = String(vehicle.transmissionRisk || "").toUpperCase();
  const mechanical = String(vehicle.mechanicalRiskLevel || "").toUpperCase();

  if (engine === "HIGHER") deduction += 0.12;
  else if (engine === "MODERATE") deduction += 0.05;
  else if (engine === "LOW") deduction += 0.01;

  if (transmission === "HIGHER") deduction += 0.10;
  else if (transmission === "MODERATE") deduction += 0.04;
  else if (transmission === "LOW") deduction += 0.01;

  if (mechanical === "HIGHER") deduction += 0.08;
  else if (mechanical === "MODERATE") deduction += 0.03;
  else if (mechanical === "LOW") deduction += 0.01;

  return clamp(deduction, 0, 0.28);
}

function getMinimumReasonableValue(vehicle = {}, msrp = 0) {
  const tier = getBrandTier(vehicle.make || "");
  const ageBucket = getVehicleAgeBucket(vehicle.year);

  let floorPercent = 0.08;
  let floorCash = 2000;

  if (tier === "exotic") {
    floorPercent = 0.35;
    floorCash = 80000;
  } else if (tier === "ultraLuxury") {
    floorPercent = 0.22;
    floorCash = 35000;
  } else if (tier === "luxury") {
    floorPercent = 0.14;
    floorCash = 8000;
  } else if (tier === "premium") {
    floorPercent = 0.11;
    floorCash = 5000;
  }

  if (ageBucket === "13_plus" && tier === "mainstream") {
    floorPercent = 0.05;
    floorCash = 1500;
  }

  return Math.max(msrp * floorPercent, floorCash);
}

function buildMarketAnalysis(vehicle) {
  const year = intValue(vehicle.year) || 2018;
  const make = safeValue(vehicle.make);
  const model = safeValue(vehicle.model);
  const brandTier = getBrandTier(make);
  const vehicleSegment = getVehicleSegmentForPricing(vehicle);
  const ageBucket = getVehicleAgeBucket(year);
  const fuelType = normalizeFuelType(vehicle);

  const msrp = estimateBaseMSRP(vehicle);
  const depRate = getBaseDepreciationRate(vehicle);

  let marketBase = getDepreciatedBaseValue(msrp, year, depRate);
  marketBase = applyBrandTierAdjustment(marketBase, make);
  marketBase = applySegmentMarketAdjustment(marketBase, vehicle);
  marketBase = marketBase * (1 - getRiskDeductionPercent(vehicle));

  const floorValue = getMinimumReasonableValue(vehicle, msrp);
  marketBase = Math.max(marketBase, floorValue);

  const buyerLow = roundToNearestHundred(marketBase * 0.95);
  const buyerHigh = roundToNearestHundred(marketBase * 1.05);

  const tradeLow = roundToNearestHundred(marketBase * 0.85);
  const tradeHigh = roundToNearestHundred(marketBase * 0.95);

  const retailFair = roundToNearestHundred(marketBase * 0.94);
  const retailGood = roundToNearestHundred(marketBase * 1.10);
  const retailExcellent = roundToNearestHundred(marketBase * 1.22);

  const ageBucketLabel = getAgeBucketLabel(ageBucket);

const analystNote = buildAnalystNote({
  year,
  make,
  model,
  ageBucket,
  brandTier,
  vehicleSegment,
  fuelType,
  engineRiskLevel: vehicle.engineRiskLevel,
  transmissionRisk: vehicle.transmissionRisk,
  mechanicalRiskLevel: vehicle.mechanicalRiskLevel
});

  return {
    valuationDate: "March 2026",
    method: "Dynamic rules based valuation using brand tier, vehicle segment, fuel type, age bucket, and integrated engine, transmission, and mechanical risk",
    retailValues: {
      excellent: retailExcellent,
      good: retailGood,
      fair: retailFair
    },
    tradeValues: {
      excellent: tradeHigh,
      good: roundToNearestHundred((tradeLow + tradeHigh) / 2),
      fair: tradeLow
    },
    buyerTargetValues: {
      low: buyerLow,
      high: buyerHigh
    },
    classification: {
      brandTier,
      vehicleSegment,
      fuelType,
      ageBucket
    },
    pricingLogic: {
      estimatedMSRP: roundToNearestHundred(msrp),
      baseDepreciationRate: depRate,
      marketBase: roundToNearestHundred(marketBase)
    },
    analystNote
  };
}

function buildEngineAdvisory(vehicle) {
  const vehicleRef = getVehicleReference(vehicle);
  const make = upperText(vehicle.make);
  const model = safeValue(vehicle.model);
  const year = intValue(vehicle.year);
  const engineInfo = getEngineIntelligence(vehicle);
  const enginePlatform = upperText(engineInfo.enginePlatform);
  const engineRisk = upperText(vehicle.engineRiskLevel);
  const transmissionRisk = upperText(vehicle.transmissionRisk);

  if (make === "BMW" && year === 2016 && upperText(model).includes("320")) {
    return {
      title: "Split Year Engine Advisory",
      summary: `For this ${vehicleRef}, 2016 sits near a four cylinder engine transition point. The exact engine fitted changes long term ownership risk, buyer confidence, and maintenance exposure.`,
      advisoryItems: [
        {
          heading: "Confirm exact engine family",
          body: `This ${vehicleRef} may sit near the N20 to B48 transition window. Confirm the exact engine before treating it as a lower risk buy.`
        },
        {
          heading: "Service history matters more than usual",
          body: `For this ${vehicleRef}, cooling system work, oil change discipline, and evidence of leak related repairs matter heavily.`
        },
        {
          heading: "Use uncertainty as negotiation leverage",
          body: `If the seller cannot clearly confirm engine family and maintenance history on this ${vehicleRef}, the price should reflect that uncertainty.`
        }
      ]
    };
  }

  if (enginePlatform.includes("EA888")) {
    return {
      title: "Turbo Four Cylinder Ownership Advisory",
      summary: `For this ${vehicleRef}, the likely EA888 turbocharged engine setup can be strong, but cooling system condition, water pump history, carbon buildup, and oil servicing matter directly to ownership cost.`,
      advisoryItems: [
        {
          heading: "Check water pump and cooling history",
          body: `For this ${vehicleRef}, cooling related repairs and water pump history are meaningful ownership indicators.`
        },
        {
          heading: "Carbon buildup matters with age",
          body: `As this ${vehicleRef} gets older and mileage rises, intake and combustion efficiency issues can become more relevant.`
        },
        {
          heading: "Do not buy on performance feel alone",
          body: `A smooth test drive in this ${vehicleRef} is useful, but service history and maintenance quality matter more than how strong it feels for ten minutes.`
        }
      ]
    };
  }

  if (enginePlatform.includes("ECOBOOST")) {
    return {
      title: "Turbocharged Ford Engine Advisory",
      summary: `For this ${vehicleRef}, the EcoBoost engine can deliver strong performance, but maintenance discipline, cooling system condition, and turbo related wear matter more than on a simpler naturally aspirated setup.`,
      advisoryItems: [
        {
          heading: "Review oil change history carefully",
          body: `Turbocharged engines in vehicles like this ${vehicleRef} are less forgiving of inconsistent oil servicing, especially at higher mileage.`
        },
        {
          heading: "Watch for cooling and timing related costs",
          body: `For this ${vehicleRef}, cooling system neglect and timing related wear can materially change ownership cost.`
        },
        {
          heading: "Truck and towing use matters",
          body: `If this ${vehicleRef} has been used for towing or heavier load work, buyer caution should increase and the price should reflect that.`
        }
      ]
    };
  }

  if (enginePlatform.includes("GM GEN V V8")) {
    return {
      title: "GM V8 Ownership Advisory",
      summary: `For this ${vehicleRef}, the likely GM direct injected V8 setup is widely used and familiar, but lifter behavior, active fuel management concerns, and service history still matter.`,
      advisoryItems: [
        {
          heading: "Listen for valvetrain noise",
          body: `On this ${vehicleRef}, abnormal startup noise, ticking, or inconsistent idle behavior should be taken seriously.`
        },
        {
          heading: "Ask about oil servicing and repair history",
          body: `The maintenance record for this ${vehicleRef} matters heavily when assessing long term reliability and future repair exposure.`
        },
        {
          heading: "Do not pay clean example money for uncertainty",
          body: `If this ${vehicleRef} has weak history or signs of unresolved engine concerns, negotiation should move lower.`
        }
      ]
    };
  }

  if (
    enginePlatform.includes("TOYOTA HYBRID SYNERGY DRIVE") ||
    enginePlatform.includes("TOYOTA LEXUS HYBRID") ||
    enginePlatform.includes("HONDA HYBRID") ||
    enginePlatform.includes("KIA HYBRID") ||
    enginePlatform.includes("HYUNDAI HYBRID") ||
    enginePlatform.includes("VOLVO DRIVE E HYBRID")
  ) {
    return {
      title: "Hybrid System Advisory",
      summary: `For this ${vehicleRef}, the hybrid powertrain can be a strong ownership setup, but battery age, cooling behavior, software health, and proper servicing still matter before purchase.`,
      advisoryItems: [
        {
          heading: "Battery age still matters",
          body: `Even on a lower risk hybrid setup, this ${vehicleRef} should still be judged with battery age, warning lights, and real world operating smoothness in mind.`
        },
        {
          heading: "Look for system related warning lights",
          body: `Hybrid and charging related faults on this ${vehicleRef} can be costly to diagnose if ignored.`
        },
        {
          heading: "Efficiency does not cancel inspection needs",
          body: `This ${vehicleRef} can still be a poor buy if general condition, service history, or cooling system health is weak.`
        }
      ]
    };
  }

  if (enginePlatform.includes("TOYOTA TRUCK AND SUV GASOLINE") || enginePlatform.includes("TOYOTA LEXUS GASOLINE")) {
    return {
      title: "Toyota Lexus Gasoline Advisory",
      summary: `For this ${vehicleRef}, the likely Toyota or Lexus gasoline setup is usually a stronger ownership proposition, but maintenance history, leak checks, and mileage still matter with age.`,
      advisoryItems: [
        {
          heading: "Do not assume low risk means no risk",
          body: `Even with a stronger engine reputation, this ${vehicleRef} should still be judged on service history, fluid condition, and evidence of steady maintenance.`
        },
        {
          heading: "Truck and SUV use history matters",
          body: `If this ${vehicleRef} has seen towing, off road use, or heavier duty operation, wear patterns can change significantly.`
        },
        {
          heading: "Condition should still drive price",
          body: `A stronger engine profile supports buyer confidence on this ${vehicleRef}, but poor condition should still lower what you are willing to pay.`
        }
      ]
    };
  }

  if (enginePlatform.includes("HONDA EARTH DREAMS") || enginePlatform.includes("HONDA ACURA MODERN GASOLINE")) {
    return {
      title: "Honda Acura Engine Advisory",
      summary: `For this ${vehicleRef}, the likely Honda or Acura gasoline setup can work well long term, but exact variant, oil servicing, and any turbocharged complexity still need attention.`,
      advisoryItems: [
        {
          heading: "Check maintenance consistency",
          body: `Regular oil service and a clean ownership record still sit at the center of a good buying decision for this ${vehicleRef}.`
        },
        {
          heading: "Turbocharged variants deserve more scrutiny",
          body: `If this ${vehicleRef} uses a smaller turbocharged gasoline setup, careful servicing matters more than on an older naturally aspirated alternative.`
        },
        {
          heading: "Do not overpay for badge confidence",
          body: `Even if this ${vehicleRef} comes from a stronger brand reputation, inspection and sensible negotiation still matter.`
        }
      ]
    };
  }

  if (enginePlatform.includes("NISSAN MODERN GASOLINE") || enginePlatform.includes("INFINITI NISSAN MODERN GASOLINE")) {
    return {
      title: "Nissan Infiniti Powertrain Advisory",
      summary: `For this ${vehicleRef}, engine side risk may be manageable, but the buying decision should still weigh transmission exposure, service history, and overall condition together.`,
      advisoryItems: [
        {
          heading: "Judge engine and transmission together",
          body: `A usable engine profile on this ${vehicleRef} does not cancel out a weaker transmission story, so the full powertrain needs to be judged as one decision.`
        },
        {
          heading: "Cooling and fluid history matter",
          body: `Routine maintenance on this ${vehicleRef} still has a major effect on how confidently it can be bought.`
        },
        {
          heading: "Negotiate if history is weak",
          body: `If this ${vehicleRef} has a thin service record or visible warning signs, the price should reflect that risk.`
        }
      ]
    };
  }

  if (enginePlatform.includes("M274") || enginePlatform.includes("M264") || enginePlatform.includes("MERCEDES TURBOCHARGED SIX CYLINDER")) {
    return {
      title: "Mercedes Engine Advisory",
      summary: `For this ${vehicleRef}, the likely Mercedes turbocharged engine setup can be refined and capable, but maintenance discipline, electronics exposure, and repair cost matter more than on a simpler mainstream alternative.`,
      advisoryItems: [
        {
          heading: "Maintenance quality matters more than mileage alone",
          body: `A lower mileage ${vehicleRef} with weak servicing can be a worse buy than a higher mileage one with strong records.`
        },
        {
          heading: "Premium ownership costs should be assumed",
          body: `Parts pricing, diagnostics, and repair pathways on this ${vehicleRef} are often more expensive than average.`
        },
        {
          heading: "Do not buy without strong records",
          body: `A weak paper trail on this ${vehicleRef} should directly affect what you are willing to pay.`
        }
      ]
    };
  }

  if (enginePlatform.includes("VOLVO DRIVE E")) {
    return {
      title: "Volvo Drive E Advisory",
      summary: `For this ${vehicleRef}, the likely Volvo Drive E setup is modern and efficient, but turbocharged complexity, software behavior, and cooling condition still matter.`,
      advisoryItems: [
        {
          heading: "Software and servicing both matter",
          body: `This ${vehicleRef} relies on both mechanical health and electronic system health, so incomplete history should not be ignored.`
        },
        {
          heading: "Cooling and warning lights deserve close attention",
          body: `Any evidence of overheating history or repeated warning lights on this ${vehicleRef} should be treated as meaningful.`
        },
        {
          heading: "Buy on condition, not badge alone",
          body: `A premium family SUV or sedan like this ${vehicleRef} still needs pricing discipline if ownership records are incomplete.`
        }
      ]
    };
  }

  if (enginePlatform.includes("KIA MODERN GASOLINE") || enginePlatform.includes("HYUNDAI MODERN GASOLINE")) {
    return {
      title: "Hyundai Kia Engine Advisory",
      summary: `For this ${vehicleRef}, the likely Hyundai or Kia gasoline setup can be a workable mainstream ownership option, but exact engine generation, campaign history, and oil servicing matter more than many buyers assume.`,
      advisoryItems: [
        {
          heading: "Check campaign and recall history closely",
          body: `Known engine related campaigns make a proper record review especially important for this ${vehicleRef}.`
        },
        {
          heading: "Oil service discipline matters",
          body: `A weak service history on this ${vehicleRef} should reduce buyer confidence and lower price tolerance.`
        },
        {
          heading: "Do not rely on low sticker price alone",
          body: `A cheap purchase price on this ${vehicleRef} is not good value if the mechanical history is uncertain.`
        }
      ]
    };
  }

  if (enginePlatform.includes("SUBARU BOXER")) {
    return {
      title: "Subaru Boxer Advisory",
      summary: `For this ${vehicleRef}, the boxer engine layout is distinctive and common to the brand, but oil consumption patterns, gasket history, and paired transmission behavior still need careful review.`,
      advisoryItems: [
        {
          heading: "Look beyond all wheel drive appeal",
          body: `This ${vehicleRef} can still become expensive to own if fluid service, oil checks, and driveline condition have been neglected.`
        },
        {
          heading: "Engine and transmission should be judged together",
          body: `The boxer setup in this ${vehicleRef} should not be judged in isolation from the transmission and maintenance history.`
        },
        {
          heading: "Use inspection to separate good examples from average ones",
          body: `Condition matters more than generic brand reputation when pricing this ${vehicleRef}.`
        }
      ]
    };
  }

  if (enginePlatform.includes("SKYACTIV")) {
    return {
      title: "Mazda Skyactiv Advisory",
      summary: `For this ${vehicleRef}, the Skyactiv engine family is usually viewed favorably, but routine maintenance, fluid condition, and overall care still matter as the vehicle ages.`,
      advisoryItems: [
        {
          heading: "Lower risk still needs proof",
          body: `A stronger engine reputation helps this ${vehicleRef}, but it does not replace inspection and history review.`
        },
        {
          heading: "Condition should lead pricing",
          body: `A clean record and strong service history can support confidence in this ${vehicleRef}, while weak upkeep should still lower your offer.`
        },
        {
          heading: "Look for signs of normal wear being ignored",
          body: `Tires, brakes, fluids, and cosmetic neglect on this ${vehicleRef} often reveal how carefully it has really been owned.`
        }
      ]
    };
  }

  if (enginePlatform.includes("PORSCHE MODERN GASOLINE")) {
    return {
      title: "Porsche Performance Advisory",
      summary: `For this ${vehicleRef}, the likely Porsche performance engine setup can be desirable, but parts cost, specialist servicing, and performance use history make disciplined buying essential.`,
      advisoryItems: [
        {
          heading: "Specialist history matters",
          body: `A strong service file for this ${vehicleRef} matters far more than it would on an average mainstream vehicle.`
        },
        {
          heading: "Performance appeal can hide ownership cost",
          body: `This ${vehicleRef} should be bought with the expectation of higher than average maintenance and repair exposure.`
        },
        {
          heading: "Negotiate hard if records are incomplete",
          body: `Uncertainty on this ${vehicleRef} should reduce what you are willing to pay.`
        }
      ]
    };
  }

  if (enginePlatform.includes("JAGUAR LAND ROVER MODERN GASOLINE")) {
    return {
      title: "Jaguar Land Rover Advisory",
      summary: `For this ${vehicleRef}, the likely Jaguar Land Rover gasoline setup can feel premium and desirable, but ownership exposure can be materially higher because of complexity, electronics, and repair cost.`,
      advisoryItems: [
        {
          heading: "Condition and records matter heavily",
          body: `You should be much more skeptical of incomplete service history on this ${vehicleRef}.`
        },
        {
          heading: "Do not stretch to buy the badge",
          body: `A cheaper purchase price on this ${vehicleRef} can still turn into expensive ownership if the underlying condition is weak.`
        },
        {
          heading: "Use risk as direct negotiation leverage",
          body: `If servicing, warning lights, or history are unclear on this ${vehicleRef}, your offer should move materially lower.`
        }
      ]
    };
  }

  if (enginePlatform.includes("TESLA ELECTRIC DRIVE UNIT")) {
    return {
      title: "Electric Drive Advisory",
      summary: `For this ${vehicleRef}, the electric drive setup removes many traditional engine failure points, but battery health, charging performance, software behavior, and warranty position matter more.`,
      advisoryItems: [
        {
          heading: "Battery and charging behavior matter most",
          body: `Traditional engine concerns are reduced on this ${vehicleRef}, but battery confidence and charging reliability become central to the buying decision.`
        },
        {
          heading: "Software and warning history still matter",
          body: `This ${vehicleRef} should still be judged on alerts, updates, and evidence of stable operating behavior.`
        },
        {
          heading: "Range confidence affects value",
          body: `Buyer confidence in this ${vehicleRef} is tied closely to battery condition and how the vehicle has aged in real use.`
        }
      ]
    };
  }

  return {
    title: "General Engine Advisory",
    summary: `For this ${vehicleRef}, there is not yet a deeply specialized engine advisory profile, so buying confidence should rely more heavily on service history, mechanical inspection, warning lights, and price discipline.`,
    advisoryItems: [
      {
        heading: "Use inspection to fill data gaps",
        body: `Where this ${vehicleRef} is not deeply profiled yet, the inspection matters more in separating a good example from a risky one.`
      },
      {
        heading: "Service history should guide confidence",
        body: `If this ${vehicleRef} has a complete maintenance record, confirm it before the test drive. Service records matter more than how the vehicle feels on a short drive.`
      },
      {
        heading: "Do not pay clean example money for uncertainty",
        body: `If records are weak or questions remain on this ${vehicleRef}, the price should move lower to reflect that.`
      }
    ]
  };
}

function getCostMultiplier(vehicle) {
  const make = safeValue(vehicle.make).toLowerCase();

  if (make.includes("ferrari") || make.includes("lamborghini") || make.includes("mclaren")) return 3.0;
  if (make.includes("porsche")) return 2.2;
  if (make.includes("bmw") || make.includes("mercedes") || make.includes("audi")) return 1.8;
  if (make.includes("tesla")) return 1.6;
  if (make.includes("lexus")) return 1.3;

  return 1.0;
}

function scaleCost(min, max, multiplier) {
  const low = Math.round(min * multiplier);
  const high = Math.round(max * multiplier);

  return `$${low.toLocaleString("en-US")} to $${high.toLocaleString("en-US")}`;
}

function buildRiskForecast(vehicle, ownership, safety) {
  const vehicleRef = getVehicleReference(vehicle);
  const body = getBodyType(vehicle);
  const drive = getDriveTypeGroup(vehicle);
  const fuel = getFuelGroup(vehicle);
  const multiplier = getCostMultiplier(vehicle);

  const items = [
    {
      area: "Suspension Wear",
      risk: drive === "awd" || body === "suv" || body === "truck" ? "High" : "Medium",
      note: `On this ${vehicleRef}, suspension components such as bushings, links, and control arms need closer inspection and are likely to require replacement if they have not already been addressed.`,
      estimatedCost: body === "truck" || body === "suv"
  ? scaleCost(500, 1500, multiplier)
  : scaleCost(400, 1200, multiplier)
    },
    {
      area: "Cooling System",
      risk: fuel === "electric" ? "Low" : "Medium",
      note: fuel === "electric"
        ? `Battery and drive unit temperature management on this ${vehicleRef} deserve close attention, rather than a conventional engine cooling layout.`
        : `The cooling system on this ${vehicleRef} needs proper attention. Hoses, pumps, thermostat related parts, and coolant condition should be checked before purchase.`,
      estimatedCost: fuel === "electric"
  ? scaleCost(150, 700, multiplier)
  : scaleCost(300, 1000, multiplier)
    },
    {
      area: "Braking System",
      risk: body === "truck" || body === "suv" ? "Medium" : "Low",
      note: `Brake wear on this ${vehicleRef} should be judged through pad life, disc condition, and any signs of vibration or uneven braking.`,
      estimatedCost: body === "truck" || body === "suv"
  ? scaleCost(350, 900, multiplier)
  : scaleCost(250, 800, multiplier)
    }
  ];

  if (fuel !== "electric") {
    items.push({
      area: "Engine Seals and Service Items",
      risk: "Medium",
      note: `This ${vehicleRef} should be checked for gasket condition, fluid leaks, and oil service history. If service records are weak, budget for catch up maintenance.`,
      estimatedCost: "$250 to $1,500"
    });
  }

  items.push({
    area: "Transmission Condition",
    risk: String(vehicle.transmissionRisk || "").toUpperCase() === "HIGHER" ? "High" : "Medium",
    note: `With this ${vehicleRef}, transmission condition should be judged by shift quality, service history, and fluid condition. If the gearbox has not been maintained properly, repair costs can rise quickly.`,
    estimatedCost: String(vehicle.transmissionRisk || "").toUpperCase() === "HIGHER"
  ? scaleCost(800, 4500, multiplier)
  : scaleCost(300, 2500, multiplier)
  });

  if (drive === "awd") {
    items.push({
      area: "All Wheel Drive System",
      risk: "Medium",
      note: `The all wheel drive system in this ${vehicleRef} should be checked for binding, tire mismatch, and driveline wear before purchase.`,
      estimatedCost: scaleCost(800, 3500, multiplier)
    });
  }

  if (fuel === "hybrid" || fuel === "electric") {
    items.push({
      area: "Electrified System Diagnostics",
      risk: "Medium",
      note: `As this ${vehicleRef} ages, battery cooling, charging hardware, and control electronics deserve closer attention.`,
      estimatedCost: scaleCost(500, 4000, multiplier) + "+"
    });
  }

  if (Number(safety?.recalls || 0) >= 3) {
    items.push({
      area: "Recall Related Follow Up",
      risk: "Medium",
      note: `Multiple recall records on this ${vehicleRef} increase the need to confirm completed remedies and verify service campaign history.`,
      estimatedCost: "Varies by open remedy status"
    });
  }

  return {
    title: "24 Month Risk Forecast",
    summary: `Over the next 24 months, this ${vehicleRef} will need attention in the areas that typically drive used vehicle ownership cost. The focus should be on current condition, not just mileage.`,
    items
  };
}

function getVehicleReference(vehicle) {
  const year = safeValue(vehicle.year, "").trim();
  const make = safeValue(vehicle.make, "").trim();
  const model = safeValue(vehicle.model, "").trim();

  return [year, make, model].filter(Boolean).join(" ").trim() || "vehicle";
}

function buildNegotiationLeverage(vehicle, ownership, safety, marketAnalysis) {
  const engineRisk = String(vehicle.engineRiskLevel || "").toUpperCase();
  const vehicleRef = getVehicleReference(vehicle);

  const items = [
    {
      title: "Maintenance History",
      script: `If this ${vehicleRef} does not have a strong service history, the price needs to reflect catch up maintenance risk.`
    },
    {
      title: "Wear Items",
      script: `For this ${vehicleRef}, tires, brakes, suspension wear, and age related service items should be expected and factored into the purchase price.`
    }
  ];

    if (ownership.maintenanceComplexity === "Higher") {
    items.push({
      title: "Platform Complexity",
      script: `This ${vehicleRef} carries higher maintenance exposure than a typical non luxury alternative, so the price needs to reflect that.`
    });
  }

    if (Number(safety.recalls || 0) >= 3) {
    items.push({
      title: "Recall Follow Up",
      script: `This ${vehicleRef} shows multiple recall records, so remedy completion should be confirmed before agreeing on price.`
    });
  }

      if (ownership.enginePlatform && ownership.enginePlatform !== "Manufacturer specific platform") {
    let engineScript = `This ${vehicleRef} sits on the ${ownership.enginePlatform} platform, so the price should reflect the maintenance exposure that comes with it.`;

    if (engineRisk === "HIGHER") {
      engineScript = `This ${vehicleRef} sits on the ${ownership.enginePlatform} platform, and that engine profile carries higher ownership risk, so stronger room is needed in the price for inspection findings and possible engine related repairs.`;
    }

    if (engineRisk === "MODERATE") {
      engineScript = `This ${vehicleRef} sits on the ${ownership.enginePlatform} platform, so the price should still leave room for maintenance exposure, inspection findings, and age related repairs.`;
    }

    items.push({
      title: "Engine Platform",
      script: engineScript
    });
  }

    if (marketAnalysis?.buyerTargetValues?.high) {
    items.push({
      title: "Buyer Range",
      script: `The price for this ${vehicleRef} needs to stay aligned with the risk adjusted buyer range, not just the seller's asking number.`
    });
  }

     let summary = `Use these points to position this ${vehicleRef} correctly based on condition, risk, and expected ownership cost.`;

  if (engineRisk === "HIGHER") {
    summary = `Use these points to position this ${vehicleRef} as a higher risk buy that still needs strong inspection results and real room in the price.`;
  }

  if (engineRisk === "MODERATE") {
    summary = `Use these points to position this ${vehicleRef} as a vehicle that may still be worth buying, but only at a price that reflects maintenance exposure and inspection risk.`;
  }

  return {
    title: "Negotiation Leverage",
    summary,
    items
  };
}

function buildOwnershipRoadmap(vehicle) {
  const vehicleRef = getVehicleReference(vehicle);
  const fuel = getFuelGroup(vehicle);

  const intervalOne = [
    `Check service history on this ${vehicleRef}`,
    `Inspect suspension, brakes, and tires`,
    `Confirm there are no active leaks or cooling issues`
  ];

  const intervalTwo = [
    `Budget for wear items on this ${vehicleRef}`,
    `Recheck brakes, suspension joints, and fluid condition`,
    `Review whether any postponed maintenance now needs to be done`
  ];

  const intervalThree = [
    `Plan for larger age related work on this ${vehicleRef}`,
    `Reassess transmission condition and driveline behavior`,
    `Keep ownership costs under control by fixing issues before they stack up`
  ];

  if (fuel === "electric") {
    intervalOne[2] = `Confirm battery, charging, and thermal system condition`;
    intervalTwo[1] = `Recheck tires, brakes, and battery cooling related systems`;
    intervalThree[1] = `Reassess battery performance, charging hardware, and drive unit behavior`;
  }

  return {
    title: "30,000 Mile Ownership Roadmap",
    summary: `This roadmap shows the areas that should be watched most closely as this ${vehicleRef} moves through the next 30,000 miles.`,
    intervals: [
      { interval: "0 to 10,000 miles", actions: intervalOne },
      { interval: "10,000 to 20,000 miles", actions: intervalTwo },
      { interval: "20,000 to 30,000 miles", actions: intervalThree }
    ]
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

function numberWithCommas(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function money(value) {
  const num = Number(value);
  if (Number.isNaN(num) || !num) return "N/A";
  return `$${num.toLocaleString("en-US")}`;
}

function buildExecutiveSummary(report) {
  const riskLevel = String(report.signals.riskLevel || "Moderate");
  const recalls = Number(report.safety.recalls || 0);
  const complaints = Number(report.safety.complaints || 0);
  const topComponent = safeValue(report.safety.topComponent);
  const complexity = safeValue(report.ownership.maintenanceComplexity) || "Moderate";

  const engineRisk = String(report.vehicle.engineRiskLevel || "").toUpperCase();
  const transmissionRisk = String(report.vehicle.transmissionRisk || "").toUpperCase();
  const mechanicalRisk = String(report.vehicle.mechanicalRiskLevel || "").toUpperCase();

  const enginePlatform = safeValue(report.ownership.enginePlatform);
  const buyerGuidance = safeValue(report.vehicle.buyerGuidance);

  const attentionFlags = Array.isArray(report.signals.attentionFlags)
    ? report.signals.attentionFlags
    : [];

  const buyerLow = Number(report.marketAnalysis?.buyerTargetValues?.low || 0);
  const buyerHigh = Number(report.marketAnalysis?.buyerTargetValues?.high || 0);
  const retailGood = Number(report.marketAnalysis?.retailValues?.good || 0);
  const totalAdjustment = Number(report.marketAnalysis?.adjustments?.totalAdjustment || 0);

  const dealRating = safeValue(report.dealAnalysis?.dealRating);
  const dealInsight = safeValue(report.dealAnalysis?.dealInsight);
  const listingPrice = Number(report.dealAnalysis?.listingPrice || 0);

  const yearMakeModel = `${safeValue(report.vehicle.year)} ${safeValue(report.vehicle.make)} ${safeValue(report.vehicle.model)}`.replace(/\s+/g, " ").trim() || "this vehicle";

  let stance = "mixed";

  if (mechanicalRisk === "HIGHER" || riskLevel === "High") {
    if (dealRating === "overpriced" || dealRating === "slightly_overpriced") {
      stance = "high_caution";
    } else {
      stance = "cautious_but_possible";
    }
  } else if (mechanicalRisk === "LOW") {
    if (dealRating === "strong_buy" || dealRating === "good_buy") {
      stance = "promising";
    } else if (dealRating === "fair") {
      stance = "worth_pursuing";
    } else {
      stance = "mixed";
    }
  } else {
    if (dealRating === "strong_buy" || dealRating === "good_buy") {
      stance = "worth_pursuing";
    } else if (dealRating === "overpriced" || dealRating === "slightly_overpriced") {
      stance = "price_too_strong";
    } else {
      stance = "mixed";
    }
  }

  const positives = [];
  const cautions = [];

  if (dealRating === "strong_buy") {
    positives.push("The current pricing looks strong on paper.");
  } else if (dealRating === "good_buy") {
    positives.push("The price sits below the safer buyer range.");
  } else if (dealRating === "fair") {
    positives.push("The current pricing is not obviously out of line.");
  } else if (dealRating === "slightly_overpriced") {
    cautions.push("The asking price is starting to lean above the safer range.");
  } else if (dealRating === "overpriced") {
    cautions.push("The asking price looks too ambitious for the current risk picture.");
  }

  if (engineRisk === "LOW") {
    positives.push("The engine profile looks more manageable than average.");
  } else if (engineRisk === "HIGHER") {
    cautions.push("The engine profile adds more ownership risk than average.");
  }

  if (transmissionRisk === "LOW") {
    positives.push("The transmission profile looks fairly reassuring on paper.");
  } else if (transmissionRisk === "HIGHER") {
    cautions.push("The transmission profile needs more care than average.");
  }

  if (mechanicalRisk === "LOW") {
    positives.push("The wider mechanical picture looks more manageable than average.");
  } else if (mechanicalRisk === "HIGHER") {
    cautions.push("The wider ownership picture carries more exposure than the better examples.");
  }

  if (recalls === 0) {
    positives.push("There are no recall records showing here.");
  } else if (recalls >= 3) {
    cautions.push("Recall activity is higher than you would want.");
  }

  if (complaints >= 20) {
    cautions.push(`Complaint activity is heavier than average${topComponent ? `, especially around ${topComponent.toLowerCase()}` : ""}.`);
  } else if (complaints > 0 && complaints < 10) {
    positives.push("Complaint activity is not especially heavy.");
  }

  if (complexity === "Higher") {
    cautions.push("Ownership complexity is on the higher side, so service history and inspection quality matter more here.");
  }

  if (attentionFlags.length >= 3) {
    cautions.push("There are several public risk signals worth checking more closely.");
  }

  let headline = "Not a write off, but you would want to inspect it carefully";

  if (stance === "promising") {
    headline = "Looks promising on paper, but still inspect it properly";
  } else if (stance === "worth_pursuing") {
    headline = "Could be worth pursuing if the condition and price line up";
  } else if (stance === "price_too_strong") {
    headline = "Could still make sense, but the price needs to come back";
  } else if (stance === "cautious_but_possible") {
    headline = "This one needs more care than the better examples";
  } else if (stance === "high_caution") {
    headline = "Hard to justify at this price without a very strong inspection";
  }

  let opening = `On paper, this ${yearMakeModel} looks mixed.`;

  if (stance === "promising") {
    opening = `On paper, this ${yearMakeModel} looks more encouraging than many similar vehicles.`;
  } else if (stance === "worth_pursuing") {
    opening = `On paper, this ${yearMakeModel} could be worth pursuing.`;
  } else if (stance === "price_too_strong") {
    opening = `On paper, this ${yearMakeModel} is not necessarily out of the running, but the current price asks a lot.`;
  } else if (stance === "cautious_but_possible") {
    opening = `On paper, this ${yearMakeModel} may still suit the right buyer, but it carries more ownership exposure than the better examples.`;
  } else if (stance === "high_caution") {
    opening = `On paper, this ${yearMakeModel} is hard to support at the current price and risk mix.`;
  }

  const selectedPositives = positives.slice(0, 2);
  const selectedCautions = cautions.slice(0, 2);

  let middle = "";

  if (selectedPositives.length && selectedCautions.length) {
    middle = `${selectedPositives.join(" ")} That said, ${selectedCautions.join(" ").charAt(0).toLowerCase()}${selectedCautions.join(" ").slice(1)}`;
  } else if (selectedCautions.length) {
    middle = selectedCautions.join(" ");
  } else if (selectedPositives.length) {
    middle = selectedPositives.join(" ");
  } else if (buyerGuidance) {
    middle = buyerGuidance;
  } else if (enginePlatform) {
    middle = `This vehicle sits on the ${enginePlatform} platform, so future maintenance exposure still needs to be judged properly.`;
  } else {
    middle = "The data gives you something to work with, but not enough to skip the usual checks.";
  }

  let detail = "";

  if (mechanicalRisk === "HIGHER") {
    if (engineRisk === "HIGHER" && transmissionRisk === "HIGHER") {
      detail += " It sits in a higher risk bracket, mainly around the engine and transmission, so condition and service history matter heavily here.";
    } else if (engineRisk === "HIGHER") {
      detail += " It sits in a higher risk bracket, mainly around the engine, so condition and service history matter more than usual.";
    } else if (transmissionRisk === "HIGHER") {
      detail += " It sits in a higher risk bracket, mainly around the transmission, so condition and service history matter more than usual.";
    } else {
      detail += " It sits in a higher risk bracket overall, so the inspection needs to do a lot of the heavy lifting.";
    }
  } else if (mechanicalRisk === "MODERATE" || riskLevel === "Moderate") {
    if (engineRisk === "HIGHER") {
      detail += " It sits in a moderate risk bracket, mainly around the engine, so condition and service history still matter more than usual.";
    } else if (transmissionRisk === "HIGHER") {
      detail += " It sits in a moderate risk bracket, mainly around the transmission, so condition and service history still matter more than usual.";
    } else {
      detail += " It sits in a moderate risk bracket, so it is worth checking carefully rather than buying on headline appeal alone.";
    }
  }

  detail += ` We found ${recalls} recall record${recalls === 1 ? "" : "s"} and ${complaints} complaint record${complaints === 1 ? "" : "s"}${topComponent ? `, with ${topComponent.toLowerCase()} appearing most often in complaint data` : ""}.`;

  if (complexity === "Higher") {
    detail += " Ownership complexity is on the higher side, so condition, service history, and inspection quality matter more here than headline mileage or a clean looking exterior.";
  } else if (complexity === "Moderate") {
    detail += " Ownership complexity is about average, but inspection quality and maintenance history still matter.";
  }

  if (enginePlatform) {
    detail += ` This vehicle sits on the ${enginePlatform} platform, which is something you should factor in when thinking about future maintenance exposure and how aggressively you negotiate.`;
  }

  if (retailGood > 0 && buyerLow > 0 && buyerHigh > 0) {
    detail += ` Similar cars in clean condition are typically advertised around ${money(retailGood)}, but once you factor in this specific vehicle, you should really be aiming closer to ${money(buyerLow)} to ${money(buyerHigh)}.`;
    detail += " That is where this starts to make sense.";
  } else if (buyerLow > 0 && buyerHigh > 0) {
    detail += ` A more realistic target here is closer to ${money(buyerLow)} to ${money(buyerHigh)}.`;
  }

  if (totalAdjustment > 0) {
    detail += ` That gap reflects roughly ${money(totalAdjustment)} in reduced value versus a cleaner, lower risk example, so the asking price should reflect that difference.`;
  }

  if (listingPrice > 0 && buyerHigh > 0) {
    if (listingPrice > buyerHigh) {
      detail += ` At the current asking price of ${money(listingPrice)}, this looks expensive for the risk profile.`;
    } else if (listingPrice >= buyerLow && listingPrice <= buyerHigh) {
      detail += ` At the current asking price of ${money(listingPrice)}, it sits broadly within the risk adjusted target range.`;
    } else if (listingPrice < buyerLow) {
      detail += ` At the current asking price of ${money(listingPrice)}, it is at least giving you some pricing room on paper.`;
    }
  }

  const watchItems = [];
  if (attentionFlags.length) watchItems.push(...attentionFlags.slice(0, 3));
  if (watchItems.length) {
    detail += ` The main things worth keeping an eye on here are ${watchItems.join(", ")}.`;
  }

  if (dealInsight) {
    detail += ` ${dealInsight}`;
  }

  let closing = "Bottom line: prioritize inspection quality, confirm maintenance history, and make sure the price reflects the risk profile.";

  if (stance === "promising") {
    closing = "Bottom line: keep it on the shortlist, but still make the inspection and service history support the data before moving ahead.";
  } else if (stance === "worth_pursuing") {
    closing = "Bottom line: this could still make sense, but only if the condition, paperwork, and price all line up properly.";
  } else if (stance === "price_too_strong") {
    closing = "Bottom line: there may still be a deal here, but not unless the seller moves to a number that reflects the risk.";
  } else if (stance === "cautious_but_possible") {
    closing = "Bottom line: treat this as a cautious maybe, not a confident yes, until the inspection and history support it.";
  } else if (stance === "high_caution") {
    closing = "Bottom line: only continue if the inspection is unusually strong and the seller gives you real financial room.";
  }

  const summary = `${opening} ${middle}${detail} ${closing}`
    .replace(/\s+/g, " ")
    .trim();

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

async function buildReportFromVin(vin, listingPrice = 0) {
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
const topOptionSignals = getTopOptionProfileItems(optionProfile);
const marketAnalysis = buildMarketAnalysis(vehicle);
const buyerLow = marketAnalysis.buyerTargetValues.low;
const buyerHigh = marketAnalysis.buyerTargetValues.high;

let dealDelta = 0;
let dealRating = "neutral";
let dealInsight = "No pricing comparison available.";

if (listingPrice > 0) {
  dealDelta = listingPrice - buyerHigh;

  if (listingPrice > buyerHigh + 2000) {
    dealRating = "overpriced";
    dealInsight = "Vehicle is priced significantly above risk adjusted market expectations. Strong negotiation required or consider walking away.";
  } else if (listingPrice > buyerHigh) {
    dealRating = "slightly_overpriced";
    dealInsight = "Vehicle is priced above target range. Negotiation recommended.";
  } else if (listingPrice >= buyerLow && listingPrice <= buyerHigh) {
    dealRating = "fair";
    dealInsight = "Vehicle is within the expected risk adjusted range. Pricing is broadly fair.";
  } else if (listingPrice < buyerLow - 2000) {
    dealRating = "strong_buy";
    dealInsight = "Vehicle is priced well below risk adjusted market expectations. Strong buy signal if condition checks out.";
  } else if (listingPrice < buyerLow) {
    dealRating = "good_buy";
    dealInsight = "Vehicle is priced below expected range. Positive buying opportunity.";
  }
}
const engineAdvisory = buildEngineAdvisory(vehicle);
const riskForecast = buildRiskForecast(vehicle, ownership, safety);
const negotiationLeverage = buildNegotiationLeverage(vehicle, ownership, safety, marketAnalysis);
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
    topOptionSignals,
    marketAnalysis,

dealAnalysis: {
  listingPrice,
  buyerLow,
  buyerHigh,
  dealDelta,
  dealRating,
  dealInsight
},

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

  report.buyerVerdict = buildExecutiveSummary(report);

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

    const listingPrice = Number((req.body && req.body.price) || 0);

const report = await buildReportFromVin(vin, listingPrice);

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
