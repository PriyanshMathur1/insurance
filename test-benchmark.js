const reviews = Array.from({ length: 100 }).map(() => ({
  quality: {
    dimensions: [
      { key: "scope", passed: true, score: 5, max: 5, label: "Scope" },
      { key: "sources", passed: true, score: 5, max: 5, label: "Sources" },
      { key: "safety", passed: false, score: 2, max: 5, label: "Safety" },
      { key: "structure", passed: true, score: 5, max: 5, label: "Structure" },
      { key: "personalization", passed: true, score: 5, max: 5, label: "Personalization" },
      { key: "nextStep", passed: true, score: 5, max: 5, label: "Next Step" }
    ]
  }
}));

const keys = ["scope", "sources", "safety", "structure", "personalization", "nextStep"];

function original() {
  const dimensionAverages = keys.map((key) => {
    const matching = reviews.flatMap((review) => review.quality.dimensions.filter((dimension) => dimension.key === key));
    const first = matching[0];
    return {
      key,
      label: first?.label ?? key,
      score: matching.length ? Math.round((matching.reduce((total, item) => total + item.score / item.max, 0) / matching.length) * 100) : 0,
      failing: matching.filter((item) => !item.passed).length,
    };
  });
  return dimensionAverages;
}

function optimized() {
  const grouped = {};
  for (let i = 0; i < reviews.length; i++) {
    const dims = reviews[i].quality.dimensions;
    for (let j = 0; j < dims.length; j++) {
      const d = dims[j];
      if (!grouped[d.key]) grouped[d.key] = [];
      grouped[d.key].push(d);
    }
  }

  const dimensionAverages = keys.map((key) => {
    const matching = grouped[key] || [];
    const first = matching[0];
    return {
      key,
      label: first?.label ?? key,
      score: matching.length ? Math.round((matching.reduce((total, item) => total + item.score / item.max, 0) / matching.length) * 100) : 0,
      failing: matching.filter((item) => !item.passed).length,
    };
  });
  return dimensionAverages;
}

console.log(JSON.stringify(original()) === JSON.stringify(optimized()));

const iters = 10000;
console.time("original");
for (let i = 0; i < iters; i++) original();
console.timeEnd("original");

console.time("optimized");
for (let i = 0; i < iters; i++) optimized();
console.timeEnd("optimized");
