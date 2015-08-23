'use strict';

var OrganParameters = [
{
    name: 'heart',
    image_src: 'o_heart.png',
    gridSize: {width: 2, height: 2},
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
    updateMetabolism: function(deltaTime) {
        if (this.veins.length > 0) {
            var maxBloodPerTick = 0.025 * deltaTime;
            var totalVeinContents = 0;
            for (var i = 0; i < this.veins.length; ++i) {
                totalVeinContents += this.veins[i].contents.total();
            }
            // Distribute things as evenly as possible among veins
            // according to the constraint how much can pass through.
            var evenContents = totalVeinContents / this.veins.length;
            for (var i = 0; i < this.veins.length; ++i) {
                var extraInVein = this.veins[i].contents.total() - evenContents;
                if (extraInVein > 0) {
                    this.contents.give(this.veins[i].contents.take(extraInVein));
                } else {
                    this.veins[i].contents.give(this.contents.take(-extraInVein));
                }
            }
            // TODO: Also oxygenate the blood.
            //this.innerContents.current['air'] += ;
            //this.contents.current['oxygen'] += this.innerContents['air'] * 0.001225 * 0.23 * 0.1;
        }
    },
    contents: {},
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
    contents: {},
    defaultVeins: []
}
];

var OrganContents = function(options) {
    var defaults = {
        'blood': 0.1, // liters
        'air': 0.0, // liters. Air is about 0.001225 kg / liter. 23% of air is oxygen by weight.
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
            collisionGroup: 0
        });
        SquishyCreature.initOrgan(organ);
        organ.renderer = OrganParameters[i].renderer;
        organ.name = OrganParameters[i].name;
        organ.updateMetabolism = OrganParameters[i].updateMetabolism;
        organ.contents = new OrganContents(OrganParameters[i].contents);
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
                width: 10,
                height: 0,
                collisionGroup: 1,
                initScale: 25
            });
            SquishyCreature.initOrgan(vein);
            vein.renderer = SquishyCreature.veinRenderer;
            // TODO: Attach vein to organs with springs/constraints
            this.physics.attachPoints(vein.positions[0], organ.positions[j]);
            this.physics.attachPoints(vein.positions[vein.positions.length - 1], organ2.positions[j]);
            this.organs.push(vein);

            organ.veins.push(vein);
            organ2.veins.push(vein);
        }
    }
};

SquishyCreature.initOrgan = function(organ) {
    organ.name = '';
    organ.contents = new OrganContents({}); // Contents that are available to blood circulation
    organ.innerContents = new OrganContents({'blood': 0.0}); // Contents like air in lungs, food in digestion.
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
    for (var i = 0; i < this.organs.length; ++i) {
        physics.renderDebug(ctx, this.organs[i]);
    }
    ctx.restore();
};

SquishyCreature.prototype.update = function(deltaTime) {
    this.time += deltaTime;
    var pulseModifier = 1.0 + Math.sin(this.time * 3) * 0.1;
    for (var i = 0; i < this.organs.length; ++i) {
        this.organs[i].time += deltaTime;
        this.organs[i].parameters.pulseModifier = 0.5 + (this.organs[i].contents.total() / this.organs[i].contents.initialTotal) * 0.6;
        this.organs[i].updateMetabolism(deltaTime);
    }
};
