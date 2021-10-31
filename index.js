var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');
const { sortedLastIndexOf } = require('lodash');
var debug;
var log;

function instance(system, id, config) {
    var self = this;

    instance_skel.apply(this, arguments);

    self.on_air = false;
    self.onair_poll_interval = undefined;
    self.song_parts = [
        { id: 0, label: 'Verse', path: 'verse' },
        { id: 1, label: 'Chorus', path: 'chorus' },
        { id: 2, label: 'Bridge', path: 'bridge' },
        { id: 3, label: 'Prechorus', path: 'prechorus' },
        { id: 4, label: 'Interlude', path: 'interlude' },
        { id: 5, label: 'Tag', path: 'tag' },
        { id: 6, label: 'Ending', path: 'ending' }
    ];

    self.init_feedbacks();
    self.init_actions();
    self.init_presets();
    self.init_variables();

    return self;
}

instance.prototype.config_fields = function() {
    return [{
            type: 'textinput',
            id: 'ip',
            label: 'Proclaim IP',
            width: 5,
            default: "127.0.0.1",
            regex: self.REGEX_IP
        },
        {
            type: 'number',
            id: 'port',
            label: 'Proclaim Port (Usually 52195)',
            width: 4,
            default: 52195,
            regex: self.REGEX_PORT
        }
    ];
}

instance.prototype.destroy = function() {
    var self = this;

    if (self.onair_poll_interval !== undefined) {
        clearInterval(self.onair_poll_interval);
    }

    self.debug('destroy', self.id);
}

instance.prototype.init = function() {
    var self = this;

    debug = self.debug;
    log = self.log;

    self.init_onair_poll();
}

instance.prototype.init_actions = function() {
    var self = this;

    var actions = {
        'next_slide': { label: 'Next Slide' },
        'previous_slide': { label: 'Previous Slide' },
        'next_item': { label: 'Next Service Item' },
        'prev_item': { label: 'Prev Service Item' },
        'on_air': { label: 'Go On Air' },
        'off_air': { label: 'Go Off Air' },
        'on_air_toggle': { label: 'Toggle On Air' },
        'song_part': {
            label: 'Song Part',
            options: [{
                type: 'dropdown',
                id: 'song_part',
                label: 'Song Part',
                default: 0,
                choices: self.song_parts,
            }, {
                type: 'number',
                id: 'item_index',
                label: 'Index',
                min: 1,
                default: 1,
                max: 10
            }]
        }
    };
    self.setActions(actions);
}


instance.prototype.init_presets = function() {
    var self = this;

    var presets = [];
    var bank = {
        style: 'text',
        size: "18",
        color: self.rgb(255, 255, 255),
        bgolor: self.rgb(0, 0, 0)
    };

    presets.push({
        category: 'Slides',
        label: 'Next Slide',
        bank: {...bank, text: "Next Slide" },
        actions: [{
            action: 'next_slide'
        }]
    });

    presets.push({
        category: 'Slides',
        label: 'Previous Slide',
        bank: {...bank, text: "Prev Slide" },
        actions: [{
            action: 'prev_slide'
        }]
    });

    presets.push({
        category: 'Items',
        label: 'Next Item',
        bank: {...bank, text: "Next Item" },
        actions: [{
            action: 'next_item'
        }]
    });

    presets.push({
        category: 'Items',
        label: 'Previous Item',
        bank: {...bank, text: "Prev Item" },
        actions: [{
            action: 'prev_item'
        }]
    });

    presets.push({
        category: 'On Air',
        label: 'Go On Air',
        bank: {...bank, text: "Go On Air" },
        actions: [{
            action: 'on_air'
        }]
    });

    presets.push({
        category: 'On Air',
        label: 'Go Off Air',
        bank: {...bank, text: "Go Off Air" },
        actions: [{
            action: 'off_air'
        }]
    });

    presets.push({
        category: 'On Air',
        label: 'Toggle On Air',
        bank: {...bank, text: "On Air" },
        actions: [{
            action: 'on_air_toggle'
        }],
        feedbacks: [{
            type: 'on_air',
            options: {
                background: self.rgb(0, 0, 255),
                foreground: self.rgb(255, 255, 255)
            }
        }]
    });

    for (var part in self.song_parts) {
        if (self.song_parts[part].label == "Verse") {
            for (var v = 1; v < 10; v++) {
                presets.push({
                    category: 'Slides',
                    label: self.song_parts[part].label,
                    bank: {...bank, text: self.song_parts[part].label + "\\n" + v },
                    actions: [{
                        action: 'song_part',
                        options: {
                            song_part: self.song_parts[part].id,
                            index: v
                        }
                    }],
                });
            }
        } else {
            presets.push({
                category: 'Slides',
                label: self.song_parts[part].label,
                bank: {...bank, text: self.song_parts[part].label },
                actions: [{
                    action: 'song_part',
                    options: {
                        song_part: self.song_parts[part].id,
                        index: 1
                    }
                }],
            });
        }
    }

    self.setPresetDefinitions(presets);
}

instance.prototype.init_feedbacks = function() {
    var self = this;

    var feedbacks = {};

    feedbacks['on_air'] = {
        type: 'boolean',
        label: 'Proclaim On Air',
        description: 'Whether or not Proclaim is On Air',
        style: {
            color: self.rgb(0, 0, 0),
            bgcolor: self.rgb(255, 0, 0)
        },
        callback: function(feedback) {
            return self.on_air;
        }
    };

    self.setFeedbackDefinitions(feedbacks);
}

instance.prototype.action = function(action) {
    var self = this;

    var url_base = 'http://' + self.config.ip + ':' + self.config.port + '/appCommand/perform?appCommandName=';
    var app_command = '';

    switch (action.action) {
        case 'next_slide':
            app_command = 'NextSlide';
            break;
        case 'prev_slide':
            app_command = 'PreviousSlide';
            break;
        case 'next_item':
            app_command = 'NextServiceItem';
            break;
        case 'prev_item':
            app_command = 'PreviousServiceItem';
            break;
        case 'on_air':
            app_command = 'GoOnAir';
            break;
        case 'off_air':
            app_command = 'GoOffAir';
            break;
        case 'on_air_toggle':
            if (self.on_air) {
                app_command = 'GoOffAir';
            } else {
                app_command = 'GoOnAir';
            }
            break;
        case 'song_part':
            part = self.song_parts[action.options.song_part].label;
            index = action.options.index;

            app_command = 'ShowSongLyrics' + part + 'ByVelocity&index=' + index;
            break;
    }

    self.system.emit('rest_get', url_base + app_command, function(err, result) {
        if (err !== null) {
            self.log('error', 'HTTP GET Request failed (' + result.error.code + ')');
            self.status(self.STATUS_ERROR, "No Connection");
        } else {
            self.log(result.data);
            self.status(self.STATUS_OK, "Connected");
        }
    }, undefined, { requestConfig: { timeout: 500 } });
}

instance.prototype.updateConfig = function(config) {
    var self = this;

    var do_reset = false;

    if (self.config.host != config.host) {
        do_reset = true;
    }

    if (self.config.port != config.port) {
        do_reset = true;
    }

    self.config = config;

    if (do_reset) {
        if (self.onair_poll_interval !== undefined) {
            clearInterval(self.onair_poll_interval);
        }
        self.init_onair_poll();
    }
}

instance.prototype.init_variables = function() {
    var self = this;

    self.setVariableDefinitions([{
        label: 'Proclaim On Air state',
        name: 'on_air'
    }]);
    self.setVariable('on_air', self.on_air);
}

instance.prototype.onair_poll = function() {
    var self = this;

    if (!self.config.ip && !self.config.port) {
        self.status(self.STATUS_WARNING, "No Configuration");
        return;
    }

    self.system.emit('rest_get', 'http://' + self.config.ip + ':' + self.config.port + '/onair/session', function(err, result) {
        if (err !== null) {
            self.log('error', 'HTTP GET Request failed (' + result.error.code + ')');
            self.status(self.STATUS_ERROR, "No Connection");
        } else {
            if (result.data.length > 30) {
                self.on_air = true;
            } else if (result.data.length == 0) {
                self.on_air = false;
            }
            self.status(self.STATUS_OK, "Connected");
            self.checkFeedbacks('on_air');
            self.setVariable('on_air', self.on_air);
        }
    }, undefined, { requestConfig: { timeout: 1000 } });
}

instance.prototype.init_onair_poll = function() {
    var self = this;

    self.status(self.STATUS_UNKNOWN, "Connecting");
    self.onair_poll_interval = setInterval(function() {
        self.onair_poll();
    }, 1000);
    onair_poll();
}

instance_skel.extendedBy(instance);
exports = module.exports = instance;