'use strict';

// http://biology.stackexchange.com/questions/2841/total-amount-of-co%E2%82%82-oxygen-in-bloodstream-in-humans
// oxygen per blood carried by hemoglobin: 0.00070 kg / 1.0l
// oxygen diffused in blood: 0.00035 kg / 1.0l
// total around: 0.001 kg / 1.0l

// healthy glucose in blood: also around 0.001 kg / 1.0l

var substanceIs = function(match) {
    if (match instanceof Array) {
        return function(key) { return match.indexOf(key) != -1; };
    } else {
        return function(key) { return key == match; };
    }
};

/**
 * Produce energy using oxygen and glucose ('nutrients').
 * @param {number} energyRequested Requested energy in joules.
 * @return {number} Ratio of how much of the requested energy could be produced.
 */
var produceEnergy = function(energyRequested, contents) {
    // 1 kg of glucose requires roughly 1 kg of oxygen to burn
    // C6H12O6 + 6 O2 -> 6 CO2 + 6 H20
    var reactantsAvailable = Math.min(contents.current['nutrients'], contents.current['oxygen']);
    // Fudge factor: allow only 50% of reactants to participate according to inefficiencies
    reactantsAvailable *= 0.5;
    // glucose contains around 16 MJ per kg
    var reactantsRequired = energyRequested / 16000000;
    var availability = Math.min(reactantsAvailable / reactantsRequired, 1);
    contents.take(availability * reactantsRequired, substanceIs('oxygen'));
    contents.take(availability * reactantsRequired, substanceIs('nutrients'));
    contents.give({'co2': availability * reactantsRequired});
    // the resulting water is not simulated
    return availability;
};

var passThroughBlood = function(veins, contents) {
    var totalVeinContents = 0;
    for (var i = 0; i < veins.length; ++i) {
        totalVeinContents += veins[i].contents.total();
    }
    // Distribute things evenly among veins but only if there's a large enough pressure difference.
    var evenContents = totalVeinContents / veins.length;
    for (var i = 0; i < veins.length; ++i) {
        var extraInVein = veins[i].contents.total() - evenContents;
        if (extraInVein > 0.02) {
            contents.give(veins[i].contents.take((extraInVein - 0.02) * 0.2));
        } else if (extraInVein < -0.02) {
            veins[i].contents.give(contents.take((-extraInVein - 0.02) * 0.2));
        }
    }
};

var OrganParameters = [
{
    name: 'heart',
    image_src: 'o_heart.png',
    gridSize: {width: 2, height: 2},
    collisionDef: [
        'oo ',
        'iix',
        'xxx',
    ],
    updateMetabolism: function(deltaTime) {
        if (this.veins.length > 0) {
            // Real life: the heart passes around 0.070 liters per heartbeat
            // It typically contains 0.100 liters to 0.250 liters of blood.
            // Take in less blood if the heart already contains a lot.
            // contents and innerContents correspond to the different chambers of the heart.
            var that = this;
            var handleChamber = function(contents, slotIndexFilter) {
                // heart uses around 2 watts of power normally
                var energy = produceEnergy(2 * deltaTime, contents);

                // TODO: Model this so that the pumping actually only affects the pressure of the blood,
                // and the pressure difference pumps it out.
                var heartPressure = contents.getPressure();

                for (var i = 0; i < that.veinSlots.length; ++i) {
                    var bloodIntake = 0.035 * deltaTime * Math.sin(that.time * 3.0) * 1.5 * energy - (heartPressure - 1.0) * 0.002;
                    if (slotIndexFilter(i)) {
                        var slot = that.veinSlots[i];
                        if (slot.vein !== null) {
                            if (bloodIntake > 0 && slot.isInput) {
                                var inputPressure = slot.vein.contents.getPressure();
                                if (inputPressure < 0.5) {
                                    bloodIntake *= inputPressure + 0.5;
                                }
                                contents.give(slot.vein.contents.take(bloodIntake));
                            } else if (bloodIntake < 0 && !slot.isInput) {
                                var outputPressure = slot.vein.contents.getPressure();
                                if (outputPressure > heartPressure + 0.5) {
                                    bloodIntake *= Math.max(0, 1.0 - (outputPressure - (heartPressure + 0.5)));
                                }
                                slot.vein.contents.give(contents.take(-bloodIntake));
                            }
                        }
                    }
                }
            };
            
            var ch1Filter = function(i) {return i % 2 == 0};
            handleChamber(this.contents, ch1Filter);
            handleChamber(this.innerContents, function(i) {return !ch1Filter(i);});
        }
    },
    contents: {
        'blood': 0.09
    },
    innerContents: {
        'blood': 0.09
    },
    defaultVeins: [
        {
            target: 'lungs',
            mode: 'input'
        },
        {
            target: 'intestine',
            mode: 'output'
        },
        {
            target: 'intestine',
            mode: 'input'
        },
        {
            target: 'lungs',
            mode: 'output'
        },
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
            passThroughBlood(this.veins, this.contents);
            // Max capacity of lungs is around 6 liters air.
            // A person breathes in/out around 0.5 liters per breath.
            
            // Assume lungs use 5 watts
            var energy = produceEnergy(5 * deltaTime, this.contents);

            var airIntake = 0.5 * deltaTime * Math.sin(this.time * 1.0) * 1.5 - (this.innerContents.total() - 4.0) * 0.01 * energy;
            if (airIntake > 0) {
                this.innerContents.current['air'] += airIntake;
            } else {
                this.innerContents.take(-airIntake, substanceIs(['co2', 'air']));
            }
            // Oxygenate the blood and remove CO2.
            // Air is about 0.001225 kg / liter. 23% of air is oxygen by weight.
            var oxygenInLungs = this.innerContents.current['air'] * 0.001225 * 0.23;
            // Person at rest uses 0.617 kg of oxygen per day. That's about 0.00001 kg per second.
            // In heavy exercise the amount is around 10x.            
            var maxOxygenation = oxygenInLungs * 0.01 * deltaTime;
            var availableOxygenCap = Math.max(0, this.contents.getCapacity('oxygen') - this.contents.current['oxygen']);
            this.contents.give({'oxygen': Math.min(availableOxygenCap, maxOxygenation)});
            this.innerContents.give(this.contents.take(maxOxygenation, substanceIs('co2')));
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
    collisionDef: [
        '  xxx',
        'xxxxx',
        'xxxxx',
        'xxxxx',
        'xxxox',
        'xoxxx',
        '  x  '
    ],
    image_src: 'o_digestive.png',
    gridSize: {width: 4, height: 6},
    updateMetabolism: function(deltaTime) {
        if (this.veins.length > 0) {
            // Assume the digestive system uses 5 watts
            var energy = produceEnergy(5 * deltaTime, this.contents);
            passThroughBlood(this.veins, this.contents);
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
        'co2': 0.0, // relative to oxygen - 1 unit of oxygen + nutrients produces 1 unit of co2 (produced water is ignored)
        'nutrients': 0.0 // relative to oxygen - 1 unit of oxygen + nutrients produces 1 unit of co2 (produced water is ignored)
    };
    this.current = {};
    objectUtil.initWithDefaults(this.current, defaults, options);
    // blood starts out oxygenated
    this.current['oxygen'] += this.getCapacity('oxygen');
    // blood should also have nutrients
    this.current['nutrients'] += this.current['blood'] * 0.001;
    this.initialTotal = this.total();
    this.initial = {};
    objectUtil.initWithDefaults(this.initial, defaults, this.current);
};

OrganContents.prototype.getCapacity = function(key) {
    if (key == 'oxygen') {
        return this.current['blood'] * 0.001;
    }
};

OrganContents.prototype.getPressure = function() {
    return this.total() / this.initialTotal;
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
        var organMesh = this.physics.generateMesh({
            x: 0,
            y: i * 200 - 200, 
            width: OrganParameters[i].gridSize.width,
            height: OrganParameters[i].gridSize.height,
            collisionGroup: 0,
            collisionDef: OrganParameters[i].collisionDef,
        });
        var organ = new Organ({mesh: organMesh, physics: this.physics});
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
            var veinParams = OrganParameters[i].defaultVeins[j];
            var organ2 = this.findOrganByName(veinParams.target);
            var veinMesh = this.physics.generateMesh({
                x: organ.mesh.positions[0].x,
                y: organ.mesh.positions[0].y,
                width: 15,
                height: 0,
                collisionGroup: 1,
                initScale: 25
            });
            var vein = new Organ({mesh: veinMesh, physics: this.physics});
            vein.name = 'vein';
            vein.renderer = SquishyCreature.veinRenderer;
            organ.freeVeinSlot(veinParams.mode).attachVein(vein, 0);
            organ2.freeVeinSlot().attachVein(vein, vein.mesh.positions.length - 1);
            this.organs.push(vein);
        }
    }
};

var VeinSlot = function(options) {
    var defaults = {
        gridPosIndex: 0,
        physics: null,
        organ: null,
        isInput: false,
        vein: null
    };
    objectUtil.initWithDefaults(this, defaults, options);
};

VeinSlot.prototype.attachVein = function(vein, veinPosIndex) {
    if (this.vein) {
        this.detachVein();
    }
    this.vein = vein;
    this.physics.attachPoints(vein.mesh.positions[veinPosIndex], this.organ.mesh.positions[this.gridPosIndex]);
    this.organ.veins.push(this.vein);
};

VeinSlot.prototype.detachVein = function() {
    arrayUtil.remove(this.organ.veins, this.vein);
    this.physics.detachPoint(this.organ.mesh.positions[this.gridPosIndex]);
    this.vein = null;
};

VeinSlot.prototype.getPosition = function() {
    return this.organ.mesh.positions[this.gridPosIndex].particle.state.position;
};

VeinSlot.prototype.getStress = function() {
    if (this.vein === null) {
        return 0;
    }
    return this.physics.getAttachmentStress(this.organ.mesh.positions[this.gridPosIndex]);
};

/**
 * @constructor
 */
var Organ = function(options) {
    var defaults = {
        physics: null,
        mesh: null,
        time: 0
    };
    objectUtil.initWithDefaults(this, defaults, options);
    this.name = '';
    this.contents = new OrganContents({'blood':0.1}); // Contents that are available to blood circulation
    this.innerContents = new OrganContents({}); // Contents like air in lungs, food in digestion.
    this.veins = [];
    this.veinSlots = [];
    for (var i = 0; i < this.mesh.veinIndices.length; ++i) {
        this.veinSlots.push(new VeinSlot({gridPosIndex: this.mesh.veinIndices[i], organ: this, physics: this.physics}));
    }
    for (var i = 0; i < this.mesh.inputVeinIndices.length; ++i) {
        this.veinSlots.push(new VeinSlot({gridPosIndex: this.mesh.inputVeinIndices[i], organ: this, physics: this.physics, isInput: true}));
    }
    this.time = 0;
};

Organ.prototype.updateMetabolism = function() {}; // Expected to be set on each object separately

Organ.prototype.update = function(deltaTime) {
    this.time += deltaTime;
    this.updateMetabolism(deltaTime);
    for (var i = 0; i < this.veinSlots.length; ++i) {
        var slot = this.veinSlots[i];
        if (slot.getStress() > 1.05 && this.time > 3) {
            console.log(slot.getStress());
            slot.detachVein();
        }
    }
};

Organ.prototype.freeVeinSlot = function(mode) {
    var needsToBeInput = false;
    if (mode !== undefined && mode === 'input') {
        needsToBeInput = true;
    }
    for (var i = 0; i < this.veinSlots.length; ++i) {
        if (this.veinSlots[i].vein === null && this.veinSlots[i].isInput === needsToBeInput) {
            return this.veinSlots[i];
        }
    }
    return null;
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
        this.organs[i].renderer.render(this.organs[i].mesh, worldTransform);
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
        physics.renderDebugGrid(ctx, this.organs[i].mesh);
        var posIndex = Math.floor(this.organs[i].mesh.positions.length * 0.5);
        var pos = this.organs[i].mesh.positions[posIndex];
        
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

SquishyCreature.prototype.getNearestVeinEnding = function(vec, closestDistance) {
    var nearest = null;
    for (var i = 0; i < this.organs.length; ++i) {
        var vein = this.organs[i];
        if (vein.name === 'vein') {
            var pos = vein.mesh.positions[0];
            var dist = vec.distance(pos);
            if (dist < closestDistance) {
                closestDistance = dist;
                nearest = {vein: vein, posIndex: 0};
            }
            var pos = vein.mesh.positions[vein.mesh.positions.length - 1];
            var dist = vec.distance(pos);
            if (dist < closestDistance) {
                closestDistance = dist;
                nearest = {vein: vein, posIndex: vein.mesh.positions.length - 1};
            }
        }
    }
    return nearest;
};

SquishyCreature.prototype.getNearestFreeVeinSlot = function(vec, closestDistance) {
    var nearest = null;
    for (var i = 0; i < this.organs.length; ++i) {
        var organ = this.organs[i];
        for (var j = 0; j < organ.veinSlots.length; ++j) {
            var veinSlot = organ.veinSlots[j];
            if (veinSlot.vein == null) {
                var pos = veinSlot.getPosition();
                var dist = vec.distance(pos);
                if (dist < closestDistance) {
                    closestDistance = dist;
                    nearest = veinSlot;
                }
            }
        }
    }
    return nearest;
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
        this.organs[i].mesh.parameters.pulseModifier = 0.5 + fillMult * 0.6;
        this.organs[i].update(deltaTime);
    }
};
