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

var passThroughBlood = function(veinSlots, contents) {
    var totalVeinContents = 0;
    var totalVeins = 0;
    for (var i = 0; i < veinSlots.length; ++i) {
        var vein = veinSlots[i].vein;
        if (!veinSlots[i].isInnerChamber && vein !== null) {
            totalVeinContents += vein.contents.total();
            ++totalVeins;
        }
    }
    // Distribute things evenly among veins but only if there's a large enough pressure difference.
    var evenContents = totalVeinContents / totalVeins;
    for (var i = 0; i < veinSlots.length; ++i) {
        var vein = veinSlots[i].vein;
        if (!veinSlots[i].isInnerChamber && vein !== null) {
            var extraInVein = vein.contents.total() - evenContents;
            if (extraInVein > 0.02) {
                contents.give(vein.contents.take((extraInVein - 0.02) * 0.2));
            } else if (extraInVein < -0.02) {
                vein.contents.give(contents.take((-extraInVein - 0.02) * 0.2));
            }
        }
    }
};

var OrganParameters = [
{
    name: 'heart',
    image_src: 'o_heart.png',
    gridSize: {width: 2, height: 2},
    collisionDef: [
        'oO ',
        'iIx',
        'xxx',
    ],
    updateMetabolism: function(deltaTime) {
        // Real life: the heart passes around 0.070 liters per heartbeat
        // It typically contains 0.100 liters to 0.250 liters of blood.
        // Take in less blood if the heart already contains a lot.
        // contents and innerContents correspond to the different chambers of the heart.
        var that = this;
        var handleChamber = function(contents, handleInnerChamber) {
            // heart uses around 2 watts of power normally
            var energy = produceEnergy(2 * deltaTime, contents);

            // TODO: Model this so that the pumping actually only affects the pressure of the blood,
            // and the pressure difference pumps it out.
            var heartPressure = contents.getPressure();

            for (var i = 0; i < that.veinSlots.length; ++i) {
                var bloodIntake = 0.035 * deltaTime * Math.sin(that.time * 3.0) * 1.5 * energy - (heartPressure - 1.0) * 0.002;
                var slot = that.veinSlots[i];
                if (slot.isInnerChamber == handleInnerChamber) {
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

        handleChamber(this.contents, false);
        handleChamber(this.innerContents, true);
    },
    contents: {
        'blood': 0.09
    },
    innerContents: {
        'blood': 0.09
    },
    contentsName: 'left chamber',
    innerContentsName: 'right chamber',
    defaultVeins: [
        {
            target: 'lungs',
            sourceMode: 'input',
            targetInnerChamber: false
        },
        {
            target: 'intestine',
            sourceMode: 'output',
            targetInnerChamber: false
        },
        {
            target: 'intestine',
            sourceMode: 'input',
            targetInnerChamber: false
        },
        {
            target: 'lungs',
            sourceMode: 'output',
            targetInnerChamber: false
        },
    ]
},
{
    name: 'lungs',
    image_src: 'o_lung_single.png',
    gridSize: {width: 3, height: 4},
    collisionDef: [
        'Ox  ',
        'xox ',
        'xxxx',
        ' xox',
        '  xx',
    ],
    updateMetabolism: function(deltaTime) {
        passThroughBlood(this.veinSlots, this.contents);
        // Max capacity of lungs is around 6 liters air.
        // A person breathes in/out around 0.5 liters per breath.
        
        // Assume lungs use 5 watts
        var energy = produceEnergy(5 * deltaTime, this.contents);

        var airIntake = (0.5 * deltaTime * Math.sin(this.time * 1.0) * 1.5 - (this.innerContents.total() - 4.0) * 0.01) * energy;
        var airSlot = this.veinSlots[0]; // TODO: Fix the hard-coding here
        
        if (airSlot.vein) {
            if (airIntake > 0) {
                this.innerContents.give(airSlot.vein.contents.take(airIntake));
            } else {
                airSlot.vein.contents.give(this.innerContents.take(-airIntake, substanceIs(['co2', 'air'])));
                airSlot.vein.contents.give(this.innerContents.take(-airIntake * 0.1)); // slowly eject any unsuitable contents
            }
        }
        // Oxygenate the blood and remove CO2.
        // Air is about 0.001225 kg / liter. 23% of air is oxygen by weight.
        var oxygenInLungs = this.innerContents.current['air'] * 0.001225 * 0.23;
        // Person at rest uses 0.617 kg of oxygen per day. That's about 0.00001 kg per second.
        // In heavy exercise the amount is around 10x.            
        var maxOxygenation = oxygenInLungs * 0.01 * deltaTime;
        var availableCapacity = Math.max(0, this.contents.getCapacity('oxygen') - this.contents.current['oxygen']);
        this.contents.give({'oxygen': Math.min(availableCapacity, maxOxygenation)});
        this.innerContents.give(this.contents.take(maxOxygenation, substanceIs('co2')));
    },
    contents: {
        'blood': 0.02
    },
    innerContents: {
        'air': 3
    },
    contentsName: 'blood vessels',
    innerContentsName: 'bronchi',
    defaultVeins: [
        {
            target: 'airhose',
            sourceMode: 'output',
            sourceInnerChamber: true,
            targetInnerChamber: true,
            contents: { 'air': 0.2 }
        },
    ]
},
{
    name: 'intestine',
    collisionDef: [
        '  xxx',
        'xxxxx',
        'xooxx',
        'xxxxx',
        'xxxxx',
        'xxxxx',
        '  x  '
    ],
    image_src: 'o_digestive.png',
    gridSize: {width: 4, height: 6},
    updateMetabolism: function(deltaTime) {
        // Assume the digestive system uses 10 watts
        var energy = produceEnergy(10 * deltaTime, this.contents);
        passThroughBlood(this.veinSlots, this.contents);
        
        // Add nutrients to the blood.
        var nutrientsIn = this.innerContents.current['hamburgers'] * 0.2;
        var maxAbsorbtion = nutrientsIn * 0.01 * deltaTime * energy;
        var availableCapacity = Math.max(0, this.contents.current['blood'] * 0.001 - this.contents.current['nutrients']);
        var tradeAmount = Math.min(availableCapacity, maxAbsorbtion);
        this.contents.give({'nutrients': tradeAmount});
        this.innerContents.take(tradeAmount * 5, substanceIs('hamburgers'));
    },
    contents: {
        'blood': 0.5
    },
    innerContents: {
        'hamburgers': 0.5
    },
    contentsName: 'blood vessels',
    innerContentsName: 'intestines',
    defaultVeins: []
},
{
    name: 'airhose',
    collisionDef: [
        'O '
    ],
    image_src: 'o_hose.png',
    gridSize: {width: 1, height: 0},
    updateMetabolism: function(deltaTime) {
        if (this.veins.length > 0) {
            var veinPressure = this.veins[0].contents.getPressure();
            if (veinPressure > 1.0) {
                this.veins[0].contents.take(deltaTime * (veinPressure - 1.0));
            }
            var pressureMod = 2.0 - Math.max(veinPressure - 1.0, 1.0);
            this.veins[0].contents.give({'air': deltaTime * pressureMod});
        }
    },
    contents: {},
    innerContents: {
        'air': 100
    },
    innerContentsName: 'airhose',
    defaultVeins: [],
    affix: [
        {point: 0, pos: {x: 380, y: 0}},
        {point: 1, pos: {x: 450, y: 0}},
    ]
}
];

var OrganContents = function(options, name) {
    var defaults = {
        'blood': 0.0, // liters
        'air': 0.0, // liters
        'oxygen': 0.0, // kg
        'co2': 0.0, // relative to oxygen - 1 unit of oxygen + nutrients produces 1 unit of co2 (produced water is ignored)
        'nutrients': 0.0, // relative to oxygen - 1 unit of oxygen + nutrients produces 1 unit of co2 (produced water is ignored)
        'hamburgers': 0.0 // kg
    };
    this.units = {
        'blood': 'l',
        'air': 'l',
        'oxygen': 'kg',
        'co2': 'kg',
        'nutrients': 'kg',
        'hamburgers': 'kg'
    };
    this.name = name ? name : 'vessel';
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

OrganContents.prototype.prettyPrint = function(key) {
    var unit = this.units[key];
    var val = this.current[key];
    if (val < 0.0005) {
        val *= 1000000;
        if (unit == 'kg') {
            unit = 'mg';
        } else {
            unit = 'µ' + unit;
        }
    }
    else if (val < 0.5) {
        val *= 1000;
        if (unit == 'kg') {
            unit = 'g';
        } else {
            unit = 'm' + unit;
        }
    }
    return key + ': ' + val.toFixed(1) + ' ' + unit;
};

var SquishyCreature = function(options) {
    var defaults = {
        gl: null,
        physics: null
    };

    this.debug = {};
    this.debug['Show veins'] = false;
    this.debug['Show organs'] = true;
    if (DEV_MODE) {
    }
    var datinst = dat.instance;
    var f1 = datinst.addFolder('Organs');
    f1.add(this.debug, 'Show veins');
    f1.add(this.debug, 'Show organs');
    
    var that = this;
    datinst.add({'Scramble veins':function() { that.scrambleVeins(); }}, 'Scramble veins');

    this.time = 0.0;
    objectUtil.initWithDefaults(this, defaults, options);
    this.organs = [];

    // Initialize organs
    for (var i = 0; i < OrganParameters.length; ++i) {
        var organMesh = this.physics.generateMesh({
            x: (i % 2) * 250 - 120,
            y: i * 120 - 250, 
            width: OrganParameters[i].gridSize.width,
            height: OrganParameters[i].gridSize.height,
            collisionGroup: 0,
            collisionDef: OrganParameters[i].collisionDef,
        });
        var affix = OrganParameters[i].affix ? OrganParameters[i].affix : [];
        for (var k = 0; k < affix.length; ++k) {
            var point = affix[k].point;
            var pos = affix[k].pos;
            this.physics.affixPoint(organMesh.positions[point], pos);
        }
        var organ = new Organ({mesh: organMesh, physics: this.physics});
        organ.renderer = OrganParameters[i].renderer;
        organ.name = OrganParameters[i].name;
        organ.updateMetabolism = OrganParameters[i].updateMetabolism;
        organ.contents = new OrganContents(OrganParameters[i].contents, OrganParameters[i].contentsName);
        organ.innerContents = new OrganContents(OrganParameters[i].innerContents, OrganParameters[i].innerContentsName);
        this.organs.push(organ);
    }
    // Add default veins
    var veinIndex = 0;
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
                collisionGroup: 1 + veinIndex,
                initScale: 25
            });
            ++veinIndex;
            var vein = new Organ({mesh: veinMesh, physics: this.physics});
            vein.name = 'vein';
            vein.renderer = SquishyCreature.veinRenderer;
            if (veinParams.contents) {
                vein.contents = new OrganContents(veinParams.contents);
            }
            organ.freeVeinSlot(veinParams.sourceMode).attachVein(vein, 0);
            organ2.freeVeinSlot(undefined, veinParams.targetInnerChamber).attachVein(vein, vein.mesh.positions.length - 1);
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
        isInnerChamber: false,
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
        var index = this.mesh.veinIndices[i];
        var isInput = index.type == 'i' || index.type == 'I';
        var isInnerChamber = index.type == 'I' || index.type == 'O';
        this.veinSlots.push(new VeinSlot({
            gridPosIndex: index.index,
            organ: this,
            physics: this.physics,
            isInput: isInput,
            isInnerChamber: isInnerChamber
        }));
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

Organ.prototype.isAttachedFrom = function(posIndex) {
    return this.mesh.positions[posIndex].particle.attachment !== null;
};

Organ.prototype.freeVeinSlot = function(mode, inInnerChamber) {
    var needsToBeInput = false;
    if (mode !== undefined && mode === 'input') {
        needsToBeInput = true;
    }
    for (var i = 0; i < this.veinSlots.length; ++i) {
        if (this.veinSlots[i].vein === null && 
            this.veinSlots[i].isInput === needsToBeInput &&
            (inInnerChamber === undefined || this.veinSlots[i].isInnerChamber === inInnerChamber))
        {
            return this.veinSlots[i];
        }
    }
    return null;
};

SquishyCreature.initRenderers = function(gl) {
    for (var i = 0; i < OrganParameters.length; ++i) {
        OrganParameters[i].renderer = new SoftBodyRenderer(gl, OrganParameters[i].image_src);
    }
    
    SquishyCreature.veinRenderer = new SoftBodyRenderer(gl, 'o_vein.png');
};

SquishyCreature.prototype.findOrganByName = function(name) {
    for (var i = 0; i < this.organs.length; ++i) {
        if (this.organs[i].name == name) {
            return this.organs[i];
        }
    }
    return null;
};

SquishyCreature.prototype.render = function(worldTransform, hilightedSlot) {
    for (var i = 0; i < this.organs.length; ++i) {
        var hilight = 0;
        var hilightTexCoord = [0, 0];
        if (hilightedSlot !== null && hilightedSlot.organ === this.organs[i]) {
            hilight = 1;
            var slot = hilightedSlot;
            var slotPos = new Vec2(Math.floor(slot.gridPosIndex / (slot.organ.mesh.height + 1)), slot.gridPosIndex % (slot.organ.mesh.height + 1));
            hilightTexCoord = [slotPos.x / slot.organ.mesh.width, slotPos.y / slot.organ.mesh.height];
        }
        this.organs[i].renderer.render(this.organs[i].mesh, worldTransform, hilight, hilightTexCoord);
    }
};

SquishyCreature.prototype.renderHUD = function(ctx2d) {
    ctx2d.save();

    var pos = null;
    var printLine = function(line) {
        drawText(ctx2d, line, pos.x, pos.y, true);
        pos.y += 20;
    };
    
    var printCurrentContents = function(contents) {
        var printed = 0;
        var currentContents = contents.current;
        for (var key in currentContents) {
            if (currentContents.hasOwnProperty(key) && currentContents[key] != 0) {
                printLine(contents.prettyPrint(key));
                printed++;
            }
        }
        if (printed > 0) {
            printLine(('In ' + contents.name + ':').toUpperCase());
        }
    };

    for (var i = 0; i < this.organs.length; ++i) {
        if (this.organs[i].name !== 'vein'  && !this.debug['Show organs']) continue;
        if (this.organs[i].name === 'vein'  && !this.debug['Show veins']) continue;
        var posIndex = Math.floor(this.organs[i].mesh.positions.length * 0.5);
        var pos = this.organs[i].mesh.positions[posIndex];

        ctx2d.fillStyle = '#f08';
        printCurrentContents(this.organs[i].contents);

        ctx2d.fillStyle = '#fff';
        printCurrentContents(this.organs[i].innerContents);
    }

    ctx2d.restore();
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
        var organ = this.organs[i];
        organ.time += deltaTime;
        var fillMult = (organ.contents.total() / organ.contents.initialTotal);
        if (organ.innerContents.initialTotal > 0) {
            fillMult = (organ.innerContents.total() + organ.contents.total()) / 
                       (organ.innerContents.initialTotal + organ.contents.initialTotal);
        }
        if (organ.mesh.width === 0 || organ.mesh.height === 0) {
            organ.mesh.parameters.pulseModifier = 0.8 + Math.sqrt(fillMult) * 0.3;
        } else {
            organ.mesh.parameters.pulseModifier = 0.5 + fillMult * 0.6;
        }
        organ.update(deltaTime);
    }
};

SquishyCreature.prototype.scrambleVeins = function() {
    var slots = [];
    for (var i = 0; i < this.organs.length; ++i) {
        var organ = this.organs[i];
        organ.time = 0;
        if (organ.name !== 'vein' && organ.name !== 'airhose') {
            for (var j = 0; j < organ.veinSlots.length; ++j) {
                organ.veinSlots[j].detachVein();
                slots.push(organ.veinSlots[j]);
            }
        }
    }
    slots = arrayUtil.shuffle(slots);
    var k = 0;
    for (var i = 0; i < this.organs.length; ++i) {
        var organ = this.organs[i];
        if (organ.name === 'vein') {
            slots[k].attachVein(organ, 0);
            k++;
            slots[k].attachVein(organ, organ.mesh.positions.length - 1);
            k++;
        }
    }
};
