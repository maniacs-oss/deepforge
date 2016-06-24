/*globals WebGMEGlobal, $, define*/
/*jshint browser: true*/

/**
 * Generated by VisualizerGenerator 1.7.0 from webgme on Thu May 19 2016 14:04:47 GMT-0500 (CDT).
 */

define([
    'widgets/EasyDAG/EasyDAGWidget',
    'deepforge/viz/PipelineControl',
    './OperationNode',
    './Connection',
    './SelectionManager',
    'underscore',
    'css!./styles/PipelineEditorWidget.css'
], function (
    EasyDAGWidget,
    PipelineControl,
    OperationNode,
    Connection,
    SelectionManager,
    _
) {
    'use strict';

    var REMOVE_ICON = '<td><div class="input-group"><i class="glyphicon ' +
            'glyphicon-remove"></i></div></td>',
        PipelineEditorWidget,
        WIDGET_CLASS = 'pipeline-editor',
        STATE = {
            DEFAULT: 'default',
            CONNECTING: 'connecting'
        },
        STATUS_TO_CLASS = {
            running: 'warning',
            success: 'success',
            failed: 'danger'
        };

    PipelineEditorWidget = function (logger, container, execCntr) {
        EasyDAGWidget.call(this, logger, container);
        this.$el.addClass(WIDGET_CLASS);
        this.portIdToNode = {};
        this.PORT_STATE = STATE.DEFAULT;
        this.srcPortToConnectArgs = null;
        this._connForPort = {};
        this._itemsShowingPorts = [];

        this.initExecs(execCntr);
    };

    _.extend(PipelineEditorWidget.prototype, EasyDAGWidget.prototype);
    PipelineEditorWidget.prototype.ItemClass = OperationNode;
    PipelineEditorWidget.prototype.SelectionManager = SelectionManager;
    PipelineEditorWidget.prototype.Connection = Connection;

    PipelineEditorWidget.prototype.onCreateInitialNode =
        PipelineControl.prototype.onCreateInitialNode;

    PipelineEditorWidget.prototype.setupItemCallbacks = function() {
        EasyDAGWidget.prototype.setupItemCallbacks.call(this);
        this.ItemClass.prototype.connectPort =
            PipelineEditorWidget.prototype.connectPort.bind(this);
        this.ItemClass.prototype.disconnectPort =
            PipelineEditorWidget.prototype.disconnectPort.bind(this);
    };

    //////////////////// Port Support ////////////////////
    PipelineEditorWidget.prototype.addConnection = function(desc) {
        EasyDAGWidget.prototype.addConnection.call(this, desc);
        // Record the connection with the input (dst) port
        var dstItem = this.items[desc.dst],
            dstPort;

        this._connForPort[desc.dstPort] = desc.id;
        if (dstItem) {
            dstPort = dstItem.inputs.find(port => port.id === desc.dstPort);

            if (!dstPort) {
                this._logger.error(`Could not find port ${desc.dstPort}`);
                return;
            }

            dstPort.connection = desc.id;
            // Update the given port...
            dstItem.refreshPorts();
        }
    };

    PipelineEditorWidget.prototype.addNode = function(desc) {
        EasyDAGWidget.prototype.addNode.call(this, desc);
        // Update the input port connections (if not connection)
        var item = this.items[desc.id];
        if (item) {
            item.inputs.forEach(port => 
                port.connection = this._connForPort[port.id]
            );
            // Update the item's ports
            item.refreshPorts();
        }

        // If in a "connecting-port" state, refresh the port
        if (this.PORT_STATE === STATE.CONNECTING) {
            this.PORT_STATE = STATE.DEFAULT;
            this.connectPort.apply(this, this.srcPortToConnectArgs);
        }
    };

    PipelineEditorWidget.prototype._removeConnection = function(id) {
        // Update the input node (dstPort)
        var conn = this.connections[id].desc,
            dst = this.items[conn.dst],
            port;

        if (dst) {
            port = dst.inputs.find(port => port.id === conn.dstPort);
            port.connection = null;
            dst.refreshPorts();
        }
        EasyDAGWidget.prototype._removeConnection.call(this, id);
    };

    // May not actually need these port methods
    PipelineEditorWidget.prototype.addPort = function(desc) {
        this.items[desc.nodeId].addPort(desc);
        this.portIdToNode[desc.id] = desc.nodeId;
        this.refreshUI();
    };

    PipelineEditorWidget.prototype.updatePort = function(desc) {
        this.items[desc.nodeId].updatePort(desc);
        this.refreshUI();
    };

    PipelineEditorWidget.prototype.removeNode = function(gmeId) {
        if (this.portIdToNode.hasOwnProperty(gmeId)) {
            this.removePort(gmeId);
        } else {
            EasyDAGWidget.prototype.removeNode.call(this, gmeId);
        }
    };

    PipelineEditorWidget.prototype.removePort = function(portId) {
        var nodeId = this.portIdToNode[portId];
        if (this.items[nodeId]) {
            this.items[nodeId].removePort(portId);
            this.refreshUI();
        }
    };

    PipelineEditorWidget.prototype.disconnectPort = function(portId, connId) {
        this.removeConnection(connId);
    };

    PipelineEditorWidget.prototype.connectPort = function(nodeId, id, isOutput) {
        this._logger.info('port ' + id + ' has been clicked! (', isOutput, ')');
        if (this.PORT_STATE === STATE.DEFAULT) {
            this.srcPortToConnectArgs = arguments;
            this.startPortConnection(nodeId, id, isOutput);
        } else if (this._selectedPort !== id) {
            this._logger.info('connecting ' + this._selectedPort + ' to ' + id);
            var src = !isOutput ? this._selectedPort : id,
                dst = isOutput ? this._selectedPort : id;

            this.createConnection(src, dst);
        } else if (!this._selectedPort) {
            this._logger.error(`Invalid connection state: ${this.PORT_STATE} w/ ${this._selectedPort}`);
            this.resetPortState();
        }
    };

    PipelineEditorWidget.prototype.startPortConnection = function(nodeId, id, isOutput) {
        var existingMatches = this.getExistingPortMatches(id, isOutput),
            item = this.items[nodeId];
        
        // Hide all ports except 'id' on 'nodeId'
        this._selectedPort = id;
        item.showPorts(id, !isOutput);

        // Get all existing potential port destinations for the id
        existingMatches.forEach(match =>
            this.showPorts(match.nodeId, match.portIds, isOutput)
        );

        // Show the 'add' button
        // TODO

        this.PORT_STATE = STATE.CONNECTING;
    };

    PipelineEditorWidget.prototype.onDeselect =
    PipelineEditorWidget.prototype.resetPortState = function() {
        // Reset connecting state
        this._itemsShowingPorts.forEach(item => item.hidePorts());
        this.PORT_STATE = STATE.DEFAULT;
    };

    PipelineEditorWidget.prototype.showPorts = function(nodeId, portIds, areInputs) {
        var item = this.items[nodeId];
        item.showPorts(portIds, areInputs);
        this._itemsShowingPorts.push(item);
    };

    // No extra buttons - just the empty message!
    PipelineEditorWidget.prototype.refreshExtras =
        PipelineEditorWidget.prototype.updateEmptyMsg;

    PipelineEditorWidget.prototype.refreshConnections = function() {
        // Update the connections to they first update their start/end points
        var connIds = Object.keys(this.connections),
            src,
            dst,
            conn;

        for (var i = connIds.length; i--;) {
            conn = this.connections[connIds[i]];

            // Update the start/end point
            src = this.items[conn.src];
            conn.setStartPoint(src.getPortLocation(conn.srcPort));

            dst = this.items[conn.dst];
            conn.setEndPoint(dst.getPortLocation(conn.dstPort, true));
            
            conn.redraw();
        }
    };

    //////////////////// Action Overrides ////////////////////

    PipelineEditorWidget.prototype.onAddItemSelected = function(item, selected) {
        this.createConnectedNode(item.id, selected.node.id);
    };

    //////////////////// Execution Support ////////////////////

    PipelineEditorWidget.prototype.initExecs = function(execCntr) {
        this.execTabOpen = false;
        this.executions = {};
        // Add the container for the execution info
        this.$execCntr = execCntr;
        this.$execCntr.addClass('panel panel-success');

        // Add click to expand
        this.$execHeader = $('<div>', {class: 'execution-header panel-header'});
        this.$execCntr.append(this.$execHeader);

        this.$execBody = $('<table>', {class: 'table'});
        var thead = $('<thead>'),
            tr = $('<tr>'),
            td = $('<td>');

        // Create the table header
        td.text('Name');
        tr.append(td);
        td = td.clone();
        td.text('Creation Date');
        tr.append(td);
        tr.append($('<td>'));
        thead.append(tr);
        this.$execBody.append(thead);

        // Create the table header
        this.$execContent = $('<tbody>');
        this.$execBody.append(this.$execContent);

        this.$execCntr.append(this.$execBody);

        this.$execHeader.on('click', this.toggleExecutionTab.bind(this));
        this.updateExecutions();
    };

    PipelineEditorWidget.prototype.addExecution =
    PipelineEditorWidget.prototype.updateExecution = function(desc) {
        this.executions[desc.id] = desc;
        this.updateExecutions();
    };

    PipelineEditorWidget.prototype.removeExecution = function(id) {
        delete this.executions[id];
        this.updateExecutions();
    };

    PipelineEditorWidget.prototype.updateExecutions = function() {
        var keys = Object.keys(this.executions),
            hasExecutions = !!keys.length,
            msg = `${keys.length || 'No'} Associated Execution` +
                (keys.length === 1 ? '' : 's');

        // Update the appearance
        if (this.execTabOpen && hasExecutions) {
            var execs = keys.map(id => this.executions[id])
                    .sort((a, b) => a.createdAt < b.createdAt ? -1 : 1)
                    .map(exec => this.createExecutionRow(exec));

            // Create the body of the tab
            this.$execContent.empty();
            execs.forEach(html => this.$execContent.append(html));

            this.$execContent.height(200);
            this.$execBody.show();
        } else {
            // Set the height to 0
            this.$execBody.hide();
            this.$execContent.height(0);
            this.execTabOpen = false;
        }
        this.$execHeader.text(msg);
    };

    PipelineEditorWidget.prototype.createExecutionRow = function(exec) {
        var row = $('<tr>'),
            title = $('<td>', {class: 'execution-name'}),
            timestamp = $('<td>'),
            className = STATUS_TO_CLASS[exec.status] || '',
            today = new Date().toLocaleDateString(),
            date = new Date(exec.createdAt).toLocaleDateString(),
            rmIcon = $(REMOVE_ICON);

        if (date === today) {
            date = `Today (${new Date(exec.createdAt).toLocaleTimeString()})`;
        }
        timestamp.text(date);

        title.append($('<a>').text(exec.name));
        title.on('click',
            () => WebGMEGlobal.State.registerActiveObject(exec.id));

        // Add the remove icon
        rmIcon.on('click', () => this.deleteNode(exec.id));
        row.append(title, timestamp, rmIcon);
        row[0].className = className;
        return row;
    };

    PipelineEditorWidget.prototype.toggleExecutionTab = function() {
        this.execTabOpen = !this.execTabOpen;
        this.updateExecutions();
    };

    return PipelineEditorWidget;
});
