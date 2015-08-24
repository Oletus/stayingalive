'use strict';

/*[
'xx  ',
'xxx ',
'xxxx',
'xxxx',
' xxx',
]*/

var substanceIs = function(match) {
    if (match instanceof Array) {
        return function(key) { return match.indexOf(key) != -1; };
    } else {
        return function(key) { return key == match; };
    }
};

var OrganParameters = [
{
    name: 'heart',
    image_src: 'o_heart.png',
    gridSize: {width: 2, height: 2},
    collisionDef: [
        'oo ',
        'oox',
        'xxx',
    ],
    updateMetabolism: function(deltaTime) {
        if (this.veins.length > 0) {
            // Real life: the heart passes around 0.070 liters per heartbeat
            // It typically contains 0.100 liters to 0.250 liters of blood.
            // Take in less blood if the heart already contains a lot.
            var bloodIntake = 0.07 * deltaTime * Math.sin(this.time * 3.0) * 1.5 - (this.contents.total() - 0.18) * 0.01;
            if (bloodIntake > 0) {
                this.contents.give(this.veins[0].contents.take(bloodIntake));
            } else {
                for (var i = 1; i < this.veins.length; ++i) {
                    this.veins[i].contents.give(this.contents.take(-bloodIntake));
                }
            }
        }
    },
    contents: {
        'blood': 0.15
    },
    innerContents: {
    },
    defaultVeins: [
        {
            target: 'lungs',
        },
        {
            target: 'lungs',
        }
    ]
},
{
    name: 'lungs',
    image_src: 'o_lung_single.png',
    gridSize: {width: 3, height: 4},
    collisionDef: [
        'xx  ',
        'xox ',
        'xxxx',
        ' xox',
        '  xx',
    ],
    updateMetabolism: function(deltaTime) {
        if (this.veins.length > 0) {
            var totalVeinContents = 0;
            for (var i = 0; i < this.veins.length; ++i) {
                totalVeinContents += this.veins[i].contents.total();
            }
            // Distribute things evenly among veins but only if there's a large enough pressure difference.
            var evenContents = totalVeinContents / this.veins.length;
            for (var i = 0; i < this.veins.length; ++i) {
                var extraInVein = this.veins[i].contents.total() - evenContents;
                if (extraInVein > 0.02) {
                    this.contents.give(this.veins[i].contents.take((extraInVein - 0.02) * 0.2));
                } else if (extraInVein < -0.02) {
                    this.veins[i].contents.give(this.contents.take((-extraInVein - 0.02) * 0.2));
                }
            }
            // Max capacity of lungs is around 6 liters air.
            // A person breathes in/out around 0.5 liters per breath.
            var airIntake = 0.5 * deltaTime * Math.sin(this.time * 1.0) * 1.5 - (this.innerContents.total() - 4.0) * 0.01;
            if (airIntake > 0) {
                this.innerContents.current['air'] += airIntake;
            } else {
                this.innerContents.take(-airIntake, substanceIs(['co2', 'air']));
            }
            // Oxygenate the blood and remove CO2.
            // Air is about 0.001225 kg / liter. 23% of air is oxygen by weight. 0.1 is the efficiency factor.
            var oxygenation = this.innerContents.current['air'] * 0.001225 * 0.23 * 0.1 * deltaTime;
            this.contents.give({'oxygen': oxygenation});
            this.innerContents.give(this.contents.take(oxygenation, substanceIs('co2')));
        }
    },
    contents: {
        'blood': 0.1
    },
    innerContents: {
        'air': 3
    },
    defaultVeins: []
},
{
    name: 'intestine',
    image_src: 'test.png',
    gridSize: {width: 25, height: 0},
    updateMetabolism: function(deltaTime) {
        if (this.veins.length > 0) {
            /*var maxBloodPerTick = 0.025 * deltaTime;
            var totalBlood = 0;
            for (var i = 0; i < this.veins.length; ++i) {
                totalBlood += this.veins[i].contents['blood'];
            }*/
            // TODO: Distribute blood as evenly as possible among veins
            // according to the constraint how much blood can pass through.
            // Also add nutrients to the blood.
        }
    },
    contents: {
        'blood': 0.5
    },
    innerContents: {
        'nutrients': 6
    },
    defaultVeins: []
}
];

var OrganContents = function(options) {
    var defaults = {
        'blood': 0.0, // liters
        'air': 0.0, // liters
        'oxygen': 0.0, // kg
        'co2': 0.0, // kg
        'nutrients': 0.0 // kg
    };
    this.current = {};
    objectUtil.initWithDefaults(this.current, defaults, options);
    this.initialTotal = this.total();
    this.initial = {};
    objectUtil.initWithDefaults(this.initial, defaults, options);
};

OrganContents.prototype.take = function(amount, filterFunc) {
    var matchingSubstances = this.getMatchingSubstances(filterFunc);
    var total = this.total(filterFunc);
    if (total < amount) {
        amount = total;
    }
    if (total == 0) {
        return {};
    }
    var amountProportion = amount / total;
    var amountsTaken = {};
    for (var i = 0; i < matchingSubstances.length; ++i) {
        var key = matchingSubstances[i];
        amountsTaken[key] = this.current[key] * amountProportion;
        this.current[key] -= amountsTaken[key];
    }
    return amountsTaken;
};

OrganContents.prototype.give = function(amountsGiven) {
    for (var key in amountsGiven) {
        if (this.current.hasOwnProperty(key) && amountsGiven.hasOwnProperty(key)) {
            this.current[key] += amountsGiven[key];
        }
    }
};

OrganContents.prototype.getMatchingSubstances = function(filterFunc) {
    var matching = [];
    for (var key in this.current) {
        if (this.current.hasOwnProperty(key)) {
            if (filterFunc === undefined || filterFunc(key)) {
                matching.push(key);
            }
        }
    }
    return matching;
};

OrganContents.prototype.total = function(filterFunc) {
    var total = 0;
    var matchingSubstances = this.getMatchingSubstances(filterFunc);
    for (var i = 0; i < matchingSubstances.length; ++i) {
        total += this.current[matchingSubstances[i]];
    }
    return total;
};

var SquishyCreature = function(options) {
    var defaults = {
        gl: null,
        physics: null
    };
    this.time = 0.0;
    objectUtil.initWithDefaults(this, defaults, options);
    this.organs = [];
    
    // Initialize organs
    for (var i = 0; i < OrganParameters.length; ++i) {
        var organ = this.physics.generateMesh({
            x: 0,
            y: i * 200 - 200, 
            width: OrganParameters[i].gridSize.width,
            height: OrganParameters[i].gridSize.height,
            collisionGroup: 0,
            collisionDef: OrganParameters[i].collisionDef,
        });
        SquishyCreature.initOrgan(organ);
        organ.renderer = OrganParameters[i].renderer;
        organ.name = OrganParameters[i].name;
        organ.updateMetabolism = OrganParameters[i].updateMetabolism;
        organ.contents = new OrganContents(OrganParameters[i].contents);
        organ.innerContents = new OrganContents(OrganParameters[i].innerContents);
        this.organs.push(organ);
    }
    // Add default veins
    for (var i = 0; i < OrganParameters.length; ++i) {
        var organ = this.organs[i];
        for (var j = 0; j < OrganParameters[i].defaultVeins.length; ++j) {
            var vein = OrganParameters[i].defaultVeins[j];
            var x = organ.positions[0].x;
            var y = organ.positions[0].y;
            var organ2 = this.findOrganByName(vein.target);
            var vein = this.physics.generateMesh({
                x: organ.positions[j].x,
                y: organ.positions[j].y,
                width: 15,
                height: 0,
                collisionGroup: 1,
                initScale: 25
            });
            SquishyCreature.initOrgan(vein);
            vein.renderer = SquishyCreature.veinRenderer;
            // TODO: Attach vein to organs with springs/constraints
            this.physics.attachPoints(vein.positions[0], organ.positions[organ.veinIndices[j]]);
            this.physics.attachPoints(vein.positions[vein.positions.length - 1], organ2.positions[organ2.veinIndices[j]]);
            this.organs.push(vein);

            organ.veins.push(vein);
            organ2.veins.push(vein);
        }
    }
};

SquishyCreature.initOrgan = function(organ) {
    organ.name = '';
    organ.contents = new OrganContents({'blood':0.1}); // Contents that are available to blood circulation
    organ.innerContents = new OrganContents({}); // Contents like air in lungs, food in digestion.
    organ.veins = [];
    organ.updateMetabolism = function() {};
    organ.time = 0;
};

SquishyCreature.initRenderers = function(gl) {
    for (var i = 0; i < OrganParameters.length; ++i) {
        OrganParameters[i].renderer = new SoftBodyRenderer(gl, OrganParameters[i].image_src);
    }
    
    SquishyCreature.veinRenderer = new SoftBodyRenderer(gl, 'test.png');
};

SquishyCreature.prototype.findOrganByName = function(name) {
    for (var i = 0; i < this.organs.length; ++i) {
        if (this.organs[i].name == name) {
            return this.organs[i];
        }
    }
    return null;
};

SquishyCreature.prototype.render = function(worldTransform) {
    for (var i = 0; i < this.organs.length; ++i) {
        this.organs[i].renderer.render(this.organs[i], worldTransform);
    }
};

SquishyCreature.prototype.renderDebug = function(ctx, physics, worldTransform) {
    ctx.save();
    var transX = ctx.canvas.width * 0.5;
    var transY = ctx.canvas.height * 0.5;
    ctx.translate(transX, transY);
    var scaleX = worldTransform[0] * ctx.canvas.width * 0.5;
    var scaleY = worldTransform[5] * ctx.canvas.height * 0.5;
    ctx.scale(scaleX, -scaleY);

    physics.renderDebug(ctx);

    for (var i = 0; i < this.organs.length; ++i) {
        physics.renderDebugGrid(ctx, this.organs[i]);
        var posIndex = Math.floor(this.organs[i].positions.length * 0.5);
        var pos = this.organs[i].positions[posIndex];
        
        ctx.font = 'bold 15px sans-serif';
        var currentContents = this.organs[i].contents.current;
        for (var key in currentContents) {
            if (currentContents.hasOwnProperty(key) && currentContents[key] != 0) {
                ctx.save();
                ctx.translate(pos.x, pos.y);
                ctx.scale(1, -1);
                ctx.fillStyle = '#f00';
                ctx.fillText(key + ': ' + currentContents[key].toFixed(5), 0, 0);
                pos.y += 20;
                ctx.restore();
            }
        }

        var currentContents = this.organs[i].innerContents.current;
        for (var key in currentContents) {
            if (currentContents.hasOwnProperty(key) && currentContents[key] != 0) {
                ctx.save();
                ctx.translate(pos.x, pos.y);
                ctx.scale(1, -1);
                ctx.fillStyle = '#fff';
                ctx.fillText(key + ': ' + currentContents[key].toFixed(5), 0, 0);
                pos.y += 20;
                ctx.restore();
            }
        }
    }

    ctx.restore();
};

SquishyCreature.prototype.update = function(deltaTime) {
    this.time += deltaTime;
    var pulseModifier = 1.0 + Math.sin(this.time * 3) * 0.1;
    for (var i = 0; i < this.organs.length; ++i) {
        this.organs[i].time += deltaTime;
        var fillMult = (this.organs[i].contents.total() / this.organs[i].contents.initialTotal);
        if (this.organs[i].innerContents.initialTotal > 0) {
            fillMult = (this.organs[i].innerContents.total() + this.organs[i].contents.total()) / 
                       (this.organs[i].innerContents.initialTotal + this.organs[i].contents.initialTotal);
        }
        this.organs[i].parameters.pulseModifier = 0.5 + fillMult * 0.6;
        this.organs[i].updateMetabolism(deltaTime);
    }
};
