Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    logger: new Rally.technicalservices.Logger(),
    defaults: { padding: 5, margin: 5 },
    items: [
        {xtype:'container', defaults: { margin: 5, padding: 5 }, layout: { type: 'hbox' }, items:[
            {xtype:'container',itemId:'date_selector_box'}, 
            {xtype:'container',itemId:'save_button_box'}
        ]},
        {xtype:'container',itemId:'select_checks_box', defaults: { margin: 5, padding: 5 }, layout: { type: 'hbox' }},
        {xtype:'container',itemId:'grid_box'},
        {xtype:'tsinfolink'}
    ],
    
    launch: function() {
        var me = this;
        this.logger.log("Launched with context: ",this.getContext());
        
        this.time_store = Ext.create('Rally.data.custom.Store',{
            data: [{
                'WorkItemType':'',
                'WorkItemSet':'',
                'WorkItem':'',
                'DisplayName':'Loading',
                'UserName':'',
                'Period':'',
                'ObjectID':-1,
                'ActualHours':-1,
                'Capitalizable':'',
                "Category":"",
                'Management':'',
                "Department":"",
                "ResourcePool":"",
                "Warnings":""
            }]
        });
        
        this._getTeamMembers(this.getContext().getProject().ObjectID).then({
            success: function(records){
                me.team_members = records;
                me._addDateSelectors();
            }
        });
    },
    _addDateSelectors: function() {
        var start_selector = this.down('#date_selector_box').add({
            xtype:'rallydatefield',
            itemId:'start_date_selector',
            fieldLabel: 'Include weeks from:',
            listeners: {
                scope: this,
                change: function(dp, new_value) {
                    var week_start = this._getBeginningOfWeek(new_value);
                    if ( week_start !== new_value ) {
                        dp.setValue(week_start);
                    }
                    if ( new_value.getDay() === 0 ) {
                        this._getTimesheets();
                    }
                }
            }
        });
        var end_selector = this.down('#date_selector_box').add({
            xtype:'rallydatefield',
            itemId:'end_date_selector',
            fieldLabel: 'to:',
            listeners: {
                scope: this,
                change: function(dp, new_value) {
                    var week_start = this._getBeginningOfWeek(new_value);
                    if ( week_start !== new_value ) {
                        dp.setValue(week_start);
                    }
                    if ( new_value.getDay() === 0 ) {
                        this._getTimesheets();
                    }
                }
            }
        });
        start_selector.setValue(new Date());
        end_selector.setValue(new Date());
    },
    _getBeginningOfWeek: function(js_date){
        var start_of_week_here = Ext.Date.add(js_date, Ext.Date.DAY, -1 * js_date.getDay());
        return start_of_week_here;
    },
    _addDownloadButton: function() {
        this.down('#save_button_box').add({
            xtype:'rallybutton',
            text:'save',
            scope: this,
            handler: function() {
                this._makeCSV();
            }
        });
        
    },
    _getTeamMembers: function(project_oid) {
        var me = this;
        var deferred = Ext.create('Deft.Deferred');
        Ext.create('Rally.data.wsapi.Store',{
            model:'Project',
            filters: [{ property:'ObjectID', value: project_oid }],
            autoLoad: true,
            fetch: ['TeamMembers','Name','Children'],
            listeners: {
                scope: this,
                load: function(store,records){
                    this.time_store.removeAll();
                    Ext.Array.each(records, function(project){
                        me.logger.log(project);
                        if ( project.get('Children').Count > 0 ) {
                            // get all users
                            Ext.create('Rally.data.wsapi.Store',{
                                model:'User',
                                filters: [{ property: 'UserName', operator: 'contains', value: '@' }],
                                autoLoad: true,
                                fetch: ['DisplayName','UserName','ObjectID','Category','Department','ResourcePool'],
                                listeners: {
                                    scope: me,
                                    load: function(store,users){
                                        deferred.resolve(users);
                                    }
                                }

                            });
                        } else {
                            project.getCollection('TeamMembers').load({
                                scope: this,
                                fetch: ['DisplayName','UserName','ObjectID','Category','Department','ResourcePool'],
                                callback: function(users, operation, success) {
                                    deferred.resolve(users);
                                }
                            });
                        }
                    });
                }
            }
        });
        
        this._makeGrid();
        return deferred.promise;
    },
    _getTimeRange: function() {
        this.logger.log("_getTimeRange");
        var start_selector = this.down('#start_date_selector');
        var end_selector = this.down('#end_date_selector');
        
        if ( ! end_selector || ! start_selector ) {
            return [];
        }
        
        var start = start_selector.getValue();
        var end = end_selector.getValue();
        
        this.logger.log(start,end);
        
        if ( ! start || ! end ) {
            return [];
        }
        
        if ( start > end ) { 
            start_selector.setValue(end);
            return [];
        }
        
        return [start,end];
    },
    _getTimesheets: function() {
        this.logger.log("_getTimesheets");
        var start_end = this._getTimeRange();
        
        this.time_store.clearFilter();
        this.time_store.removeAll();
        
        var number_of_team_members = this.team_members.length;
        
        for ( var w=0;w<start_end.length;w++ ) {
            for ( var i=0;i<number_of_team_members;i++ ) {
                var team_member = this.team_members[i];
                this._getTimesheetForTeamMember(start_end[w],team_member);
            }
        }
    },
    _getTimesheetForTeamMember: function(week_start,team_member) {
        this.logger.log("_getTimesheetForTeamMember",week_start,team_member);
        // force to midnight even in UTC
        var start_date = Rally.util.DateTime.toIsoString(week_start,true).replace(/T.*$/,"T00:00:00.000Z");
        this.logger.log("Start Date:",start_date);
        
        Ext.create('Rally.data.wsapi.Store',{
            autoLoad: true,
            model:'TimeEntryValue',
            fetch:['TimeEntryItem','Hours','ObjectID',
                'WorkProductDisplayString','WorkProduct',
                'TaskDisplayString','Task','Project',
                'Name','Expense','WeekStartDate'],
            filters: [
                {property:'TimeEntryItem.User.ObjectID',value:team_member.get('ObjectID')},
                {property:'TimeEntryItem.WeekStartDate',value:start_date}
            ],
            listeners: {
                scope: this,
                load: function(store,records){
                    //this.logger.log(team_member.get('UserName'),records);
                    var by_entry = {}; // key is object id for line of time
                    Ext.Array.each(records,function(record){
                        var time_oid = record.get('TimeEntryItem').ObjectID;
                        
//                        console.log( time_oid );
//                        console.log( wp, wp_display);
//                        console.log( task, task_display);
                        
                        if ( !by_entry[time_oid] ) {
                            by_entry[time_oid] = { tie: record, team_member: team_member, total: 0 };
                        }
                        var value = record.get('Hours') || 0;
                        var hours = by_entry[time_oid].total;
                        hours += value;
                        by_entry[time_oid].total = hours;
                    });
                    this._addTimeToStore(by_entry);
                    this.logger.log(team_member.get('UserName'), by_entry);
                }
            }
        });
    },
    _addTimeToStore: function(by_entry){
        var me = this;        
        Ext.Object.each(by_entry, function(oid,entry) {
            var team_member = entry.team_member;
            var record = entry.tie;
            var time_oid = record.get('TimeEntryItem').ObjectID;
            var wp = record.get('TimeEntryItem').WorkProduct;
            // var wp_display = record.get('TimeEntryItem').WorkProductDisplayString;
            var wp_display = record.get('TimeEntryItem').Project.Name;
            var task = record.get('TimeEntryItem').Task;
            var task_display = record.get('TimeEntryItem').TaskDisplayString;
            var project = record.get('TimeEntryItem').Project.Name;
            
            var week_start = new Date(record.get('TimeEntryItem').WeekStartDate);
            week_start = new Date( week_start.getTime() + ( week_start.getTimezoneOffset() * 60000 ) );
            var week_end = Rally.util.DateTime.add(week_start,'day',6);
            var period = Ext.Date.format(week_start, 'm/d/y') + " - " + Rally.util.DateTime.format(week_end, 'm/d/y');
            
            
            if ( project !== "Administrative Time" && project !== "Support" ) {
                project = "Project";
            }
            
            var warning = "";
            if ( wp_display === null ) {
                warning = "Time assigned to Project";
            }
            
            if ( wp_display !== null && wp === null ) {
                warning = "Work Product deleted";
            }
            
            var capitalizable = null;
            if ( task_display !== null & task === null ) {
                warning = "Task deleted";
            } else if ( task !== null ) {
                if ( task.c_Expense ) {
                    capitalizable = "N";
                } else {
                    capitalizable = "Y";
                }
            }
            
            me.time_store.add({
                'WorkItemType':project,
                'WorkItemSet':wp_display,
                'WorkItem': task_display,
                'DisplayName':team_member.get('DisplayName'),
                'UserName':team_member.get('UserName'),
                'Period':period,
                'ActualHours':entry.total,
                'Capitalizable':capitalizable,
                'Category':team_member.get('Category'),
                'Department':team_member.get('Department'),
                'ResourcePool':team_member.get('ResourcePool'),
                'Warnings':warning
            });
        });
    },
    _makeGrid: function() {        
        this.grid = this.down('#grid_box').add({
            xtype:'rallygrid',
            store: this.time_store,
            enableEditing: false,
            sortableColumns: false,
            columnCfgs:[ 
                { text:'Work Item Type',dataIndex:'WorkItemType'},
                { text:'Work Item Set' ,dataIndex:'WorkItemSet'},
                { text:'Work Item',     dataIndex:'WorkItem'},
                { text:'Name',dataIndex:'DisplayName', flex: 1},
                { text:'User Name',dataIndex:'UserName',flex:1},
                { text:'Period',dataIndex:'Period'},
                { text:'Actual Hours',dataIndex:'ActualHours'},
                { text:'Capitalizable',dataIndex:'Capitalizable'},
                { text:"Category",dataIndex:'Category'},
                { text:"Department",dataIndex:'Department'},
                { text:"ResourcePool",dataIndex:'ResourcePool'},
                { text:"Warnings",dataIndex:'Warnings' }
            ]
        });
        
        if ( this._isAbleToDownloadFiles() ) {
            this._addDownloadButton();
        }
    },
    _makeCSV: function() {
        var store = this.grid.getStore();
        var columns = this.grid.getColumnCfgs();
        var csv_header_array = [];
        var column_index_array = [];
        Ext.Array.each(columns,function(column){
            csv_header_array.push(column.text);
            column_index_array.push(column.dataIndex);
        });
        var csv=[];
        csv.push(csv_header_array.join(','));
        var store_count = store.getCount();
        for ( var i=0;i<store_count;i++ ) {
            var record = store.getAt(i);
            var row_array = [];
            Ext.Array.each(column_index_array, function(index_name){
                row_array.push(record.get(index_name));
            });
            csv.push(row_array.join(','));
        }
        this.logger.log("csv",csv.join('\r\n'));
        
        var file_name = "compliance_export.csv";
        var blob = new Blob([csv.join("\r\n")],{type:'text/plain;charset=utf-8'});
        saveAs(blob,file_name);
    },
    _isAbleToDownloadFiles: function() {
        try { 
            var isFileSaverSupported = !!new Blob(); 
        } catch(e){
            this.logger.log(" NOTE: This browser does not support downloading");
            return false;
        }
        return true;
    }
});
