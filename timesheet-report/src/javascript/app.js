Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    projects_to_consider_parents: ['Administrative Time','Support'],
    logger: new Rally.technicalservices.Logger(),
    defaults: { padding: 5, margin: 5 },
    low_level_pi: 'Projects', // 'Projects' for this customer
    layout: 'border',
    
    items: [
        {xtype:'container', region: 'north', defaults: { margin: 5, padding: 5 }, layout: { type: 'hbox' }, items:[
            {xtype:'container',itemId:'date_selector_box'}, 
            {xtype:'container',itemId:'type_selector_box'},
            {xtype:'container',itemId:'save_button_box'},
            {xtype:'container',itemId:'sparkler',html:''}
        ]},
        {xtype:'container',itemId:'grid_box', region: 'center', layout:'fit'},
        {xtype:'tsinfolink', region: 'south'}
    ],
    
    launch: function() {
        this.logger.log("Launched with context: ",this.getContext());
        
        if (this.isExternal()){
            this.showSettings(this.config);
        } else {
            this.onSettingsUpdate(this.getSettings());  
        }
    },
    _setUpAndGo: function() {
        this.restrict_to_current_user = this.getSetting('restrict_to_current_user');
        
        this.time_store = Ext.create('Rally.data.custom.Store',{
            pageSize: 'Infinity',
            data: [{
                'WorkItemType':'',
                'WorkItemSet':'',
                'WorkItem':'',
                'DisplayName':'Loading',
                'Initiative': '',
                'WorkProduct':'',
                'UserName':'',
                'Period':'',
                'ObjectID':-1,
                'ActualHours':-1,
                'Capitalizable':'',
                "Category":"",
                'Management':'',
                "Department":"",
                "Company":"",
                "ResourcePool":"",
                "Warnings":"",
                "ParentIO":"",
                "RallyProject":""
            }]
        });
        
        this._getTeamMembers(this.getContext().getProject().ObjectID).then({
            scope: this,
            success: function(records){
                this.team_members = records;
                this._addDateSelectors();
                if (this.restrict_to_current_user) {
                    this._addTypeSelector();
                }
            }
        });
        
        if ( this._isAbleToDownloadFiles() ) {
            this._addDownloadButton();
        }
        
    },
    _addTypeSelector: function() {
        var store = Ext.create('Ext.data.Store',{
            fields: ['display', 'value'],
            data : [
                {"display":"All", "value":"ALL"},
                {"display":"Projects", "value":"PROJECTS"},
                {"display":"Support", "value":"SUPPORT"},
                {"display":"Admin", "value":"ADMIN"},
                {"display":"Paid Time Off", "value":"PTO"}
            ]
        });
        this.down('#type_selector_box').add({
            xtype: 'combobox',
            itemId: 'type_selector',
            fieldLabel: 'Choose State',
            store: store,
            queryMode: 'local',
            displayField: 'display',
            valueField: 'value',
            value: 'All',
            listeners: {
                scope: this,
                select: function(combo) {
                    this._applyFilter(combo.getValue());
                }
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
    _applyFilter:function(selection){
        this.logger.log("_applyFilter:",selection);
        if (this.time_store) {
            var store = this.time_store;
            store.clearFilter(false);
            
            switch(selection) {
                case "ALL":
                    
                    break;
                case "PROJECTS":
                    store.filter([
                        {property: "WorkItemType", value: /Project/}
                    ]);
                    break;
                case "SUPPORT":
                    store.filter([
                        {property: "WorkItemType", value: /Support/}
                    ]);
                    break;
                case "ADMIN":
                    store.filter([
                        {property: "WorkItemType", value: /Administrative/}
                    ]);
                    break;
                case "PTO":
                    store.filter([
                        {property: "WorkItemType", value: /Administrative/},
                        {property: "WorkProduct", value: /PTO/}
                    ]);
                    break;
                default:
                    break;
            }
        }
    },
    _getBeginningOfWeek: function(js_date){
        var start_of_week_here = Ext.Date.add(js_date, Ext.Date.DAY, -1 * js_date.getDay());
        return start_of_week_here;
    },
    _addDownloadButton: function() {
        this.down('#save_button_box').add({
            xtype:'rallybutton',
            itemId: 'export_button',
            text:'Export to CSV',
            scope: this,
            disabled: true,
            handler: function() {
                this._makeCSV();
            }
        });
        
    },
    _getTeamMembers: function(project_oid) {
        var deferred = Ext.create('Deft.Deferred');
        this.logger.log("_getTeamMembers");
        this.setLoading("Getting Team Members...");
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
                        this.find_all_users = false;
                        
                        if ( project.get('Children').Count > 0 ) {
                            this.find_all_users = true;
                        }
                        
                        if ( Ext.Array.indexOf(this.projects_to_consider_parents, project.get("Name")) > -1 ) {
                            this.find_all_users = true;
                        }
                        
                        if ( this.restrict_to_current_user ) {
                            var current_user = this.getContext().getUser();
                            
                            Ext.create('Rally.data.wsapi.Store',{
                                model:'User',
                                filters: [{ property: 'ObjectID', value: current_user.ObjectID }],
                                sorters:[{property:'UserName'}],
                                autoLoad: true,
                                fetch: ['DisplayName','UserName','ObjectID','Category','Company','Department','ResourcePool'],
                                listeners: {
                                    scope: this,
                                    load: function(store,users){
                                        deferred.resolve(users);
                                    }
                                }

                            });
                        } else if ( this.find_all_users ) {
                            // get all users
                            Ext.create('Rally.data.wsapi.Store',{
                                model:'User',
                                filters: [{ property: 'UserName', operator: 'contains', value: '@' }],
                                sorters:[{property:'UserName'}],
                                autoLoad: true,
                                limit: 'Infinity',
                                fetch: ['DisplayName','UserName','ObjectID','Category','Company','Department','ResourcePool'],
                                listeners: {
                                    scope: this,
                                    load: function(store,users){
                                        deferred.resolve(users);
                                    }
                                }

                            });
                        } else {
                            project.getCollection('TeamMembers').load({
                                scope: this,
                                fetch: ['DisplayName','UserName','ObjectID','Category','Company','Department','ResourcePool'],
                                callback: function(users, operation, success) {
                                    deferred.resolve(users);
                                }
                            });
                        }
                    },this);
                }
            }
        });
        
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
        
        this.logger.log("Start/End",start,end);
        
        if ( ! start || ! end ) {
            return [];
        }
        
        if ( start > end ) { 
            start_selector.setValue(end);
            return [];
        }
                
        var time_range = [];
        if ( end >= start ) {
            var stamp = start;
            while ( stamp <= end ) {
                time_range.push(stamp);
                stamp = Rally.util.DateTime.add(stamp,"day",7);
            }
        }
        
        return time_range;
    },
    _getTimesheets: function() {
        this.logger.log("_getTimesheets");
        this.setLoading("Loading Timesheets...");
        this.down('#grid_box').removeAll();
        
        if ( this.down('#export_button') ) {
            this.down('#export_button').setDisabled(true);
        }
        
        var start_end = this._getTimeRange();
        
        this.time_store.clearFilter();
        this.time_store.removeAll();
        
        var number_of_team_members = this.team_members.length;
        this.logger.log("There are " + number_of_team_members + " team members");
        
        var promises = [];
        for ( var w=0;w<start_end.length;w++ ) {
            if (this.find_all_users) {
                promises.push(this._getTimesheetsForAll(start_end[w],this.team_members));
            } else {
                for ( var i=0;i<number_of_team_members;i++ ) {
                    var team_member = this.team_members[i];
                    promises.push(this._getTimesheetForTeamMember(start_end[w],team_member,0));
                }
            }
        }
        Deft.Promise.all(promises).then({
            scope: this,
            success: function() {
                this.setLoading("Redrawing...");
                
                this._makeGrid();
                this.setLoading(false);

                this.down('#export_button').setDisabled(false);
                this.logger.log("Ready");
            },
            failure: function(message){
                alert("Problem loading timesheets: " + message);
                this.setLoading(false);
            }
        });
    },
    _getTimesheetsForAll: function(week_start,team_members) {
        var deferred = Ext.create('Deft.Deferred');
        var start_date = Rally.util.DateTime.toIsoString(week_start,true).replace(/T.*$/,"T00:00:00.000Z");
        
        Ext.create('Rally.data.wsapi.Store',{
            autoLoad: true,
            model:'TimeEntryValue',
            limit:'Infinity',
            context: {
                project: null
            },
            fetch:['TimeEntryItem','Hours','ObjectID',
                'WorkProductDisplayString','WorkProduct',
                'TaskDisplayString','Task','Project',
                'Name','Expense','WeekStartDate','User', 'c_IONumber',
                this.low_level_pi,'FormattedID','Requirement','c_Initiative'],
            filters: [
                {property:'TimeEntryItem.WeekStartDate',value:start_date}
            ],
            listeners: {
                scope: this,
                load: function(store,records,successful, eOpts){
                    var by_user = {}; // key is object id for user
                    this.logger.log("Found ", records.length, " timesheet entries");
                    
                    // put team members into a hash for easy comparison later
                    var team_by_oid = {};
                    Ext.Array.each(team_members,function(team_member){
                        team_by_oid[team_member.get('ObjectID')] = team_member;
                    });
                    
                    Ext.Array.each(records,function(record){
                        var time_oid = record.get('TimeEntryItem').ObjectID;
                        var user_oid = record.get('TimeEntryItem').User.ObjectID;

                        if ( team_by_oid[user_oid] ) {
                            if ( !by_user[user_oid] ) {
                                by_user[user_oid] = {}; // key is object id for team_member
                            }
                            
                            if ( !by_user[user_oid][time_oid] ) {
                                by_user[user_oid][time_oid] = { tie: record, team_member: team_by_oid[user_oid], total: 0 };
                            }
                            var value = record.get('Hours') || 0;
                            var hours = by_user[user_oid][time_oid].total;
                            hours += value;
                            by_user[user_oid][time_oid].total = hours;
                        }
                    });
                    
                    Ext.Object.each(by_user,function(user,user_time){
                        this._addTimeToStore(user_time);
                    },this);
                    
                    deferred.resolve();
                }
            }
        });
        return deferred;
    },
    _getTimesheetForTeamMember: function(week_start,team_member,attempt_count) {
        //this.logger.log("_getTimesheetForTeamMember",week_start,team_member);
        var deferred = Ext.create('Deft.Deferred');
        // force to midnight even in UTC
        var start_date = Rally.util.DateTime.toIsoString(week_start,true).replace(/T.*$/,"T00:00:00.000Z");
        
        Ext.create('Rally.data.wsapi.Store',{
            autoLoad: true,
            model:'TimeEntryValue',
            limit:'Infinity',
            context: {
                project: null
            },
            fetch:['TimeEntryItem','Hours','ObjectID',
                'WorkProductDisplayString','WorkProduct',
                'TaskDisplayString','Task','Project',
                'Name','Expense','WeekStartDate', 'c_IONumber',
                this.low_level_pi,'FormattedID','Requirement','c_Initiative'],
            filters: [
                {property:'TimeEntryItem.User.ObjectID',value:team_member.get('ObjectID')},
                {property:'TimeEntryItem.WeekStartDate',value:start_date}
            ],
            listeners: {
                scope: this,
                load: function(store,records,successful, eOpts){
                    var by_entry = {}; // key is object id for line of time
                    
                    if ( ! records || records.length === 0 ) {
                        if ( !successful && attempt_count < 2 ) {
                            this.logger.log("  Retrying...", team_member.get('_refObjectName'), start_date, attempt_count);

                            var count = attempt_count || 0;
                            count = count + 1;
                            this._getTimesheetForTeamMember(week_start,team_member,count).then({
                                scope: this,
                                success: function(entry) {
                                    this.logger.log( "  Found ", entry, " after ", count , " tries");
                                    deferred.resolve(entry);
                                },
                                failure: function(msg){
                                    this.logger.log("  Failed after " + count + " tries"  + " (" + team_member.get('_refObjectName') + ")" );
                                    deferred.reject("Failed after " + count + " tries. " + msg + " (" + team_member.get('_refObjectName') + ")" );
                                }
                            });
                        }
                    } else {
                        Ext.Array.each(records,function(record){
                            var time_oid = record.get('TimeEntryItem').ObjectID;
                            
                            if ( !by_entry[time_oid] ) {
                                by_entry[time_oid] = { tie: record, team_member: team_member, total: 0 };
                            }
                            var value = record.get('Hours') || 0;
                            var hours = by_entry[time_oid].total;
                            hours += value;
                            by_entry[time_oid].total = hours;
                        });
                        
                        this._addTimeToStore(by_entry);
                    }
                    if ( successful ) {
                        deferred.resolve(by_entry);
                    }
                }
            }
        });
        return deferred;
    },
    _addTimeToStore: function(by_entry){
        var me = this;
        Ext.Object.each(by_entry, function(oid,entry) {
            var team_member = entry.team_member;
            var record = entry.tie;
            var time_oid = record.get('TimeEntryItem').ObjectID;
            var wp = record.get('TimeEntryItem').WorkProduct;
            var wp_display = record.get('TimeEntryItem').WorkProductDisplayString;
                       
            var task = record.get('TimeEntryItem').Task;
            var task_display = record.get('TimeEntryItem').TaskDisplayString;
            var project = record.get('TimeEntryItem').Project.Name;
            var rally_project = project;
            
            // when the time is against a defect, it might belong to a story
            // and should be treated like a task
            if ( task_display === null && wp && wp._type == "Defect" ) {
                task = wp;
                task_display = wp_display;
                wp = null;
                wp_display = null;
                if ( task.Requirement ) {
                    wp = task.Requirement;
                    wp_display = task.Requirement.FormattedID + ": " + task.Requirement.Name;
                }
            }
            
            var projects = null;
            var initiative = null;
            
            if ( wp && wp['c_Initiative'] ) {
                initiative = wp['c_Initiative'];
            }
            if ( wp && wp[me.low_level_pi] ) {
                projects = wp[me.low_level_pi];
            }
            
            var parent_display = null;
            var parent_io = null;
            if ( projects ) {
                parent_display = projects.Name;
                parent_io = projects.c_IONumber;
            }
            
            var week_start = new Date(record.get('TimeEntryItem').WeekStartDate);
            week_start = new Date( week_start.getTime() + ( week_start.getTimezoneOffset() * 60000 ) );
            var week_end = Rally.util.DateTime.add(week_start,'day',6);
            var period = Ext.Date.format(week_start, 'm/d/y') + " - " + Rally.util.DateTime.format(week_end, 'm/d/y');
            
            
            if ( project !== "Administrative Time" && project !== "Support" ) {
                project = "Project";
            }
            
            var warning = "";
            if ( parent_display === null && wp !== null ) {
                warning = "WorkProduct (" + wp.FormattedID + ") is not assigned to Projects";
            }
            
            if ( wp_display === null ) {
                warning = "Time assigned to Rally Project " + record.get('TimeEntryItem').Project.Name;
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
                'WorkItemSet':parent_display,
                'WorkItem': task_display,
                'Initiative': initiative,
                'WorkProduct': wp_display,
                'DisplayName':team_member.get('DisplayName'),
                'UserName':team_member.get('UserName'),
                'Period':period,
                'ActualHours':entry.total,
                'Capitalizable':capitalizable,
                'Category':team_member.get('Category'),
                'Department':team_member.get('Department'),
                'Company':team_member.get('Company'),
                'ResourcePool':team_member.get('ResourcePool'),
                'Warnings':warning,
                'ParentIO': parent_io,
                'RallyProject':rally_project
            });
            
        });
    },
    _makeGrid: function() {
        this.logger.log("_makeGrid with ", this.time_store.getCount(), " records");
        this.grid = this.down('#grid_box').add({
            xtype:'rallygrid',
            store: this.time_store,
            enableEditing: false,
            sortableColumns: false,
            showPagingToolbar: false,
            suspendLayout: false,
            columnCfgs:[ 
                { text:'Work Item Type',dataIndex:'WorkItemType'},
                { text:'Parent Project' ,dataIndex:'WorkItemSet'},
                { text: 'IO Number', dataIndex: 'ParentIO' },
                { text:'Work Product', dataIndex:'WorkProduct'},
                { text:'Rally Project', dataIndex: 'RallyProject'},
                { text:'Work Item',     dataIndex:'WorkItem'},
                { text:'Name',dataIndex:'DisplayName', flex: 1},
                /*{ text:'User Name',dataIndex:'UserName',flex:1},*/
                { text:'Period',dataIndex:'Period'},
                { text:'Actual Hours',dataIndex:'ActualHours'},
                { text:'Capitalizable',dataIndex:'Capitalizable'},
                { text:"Category",dataIndex:'Category'},
                { text:"Department",dataIndex:'Department'},
                { text:"Company",dataIndex:'Company'},
                { text:"Initiative",dataIndex:'Initiative'},
                { text:"Warnings",dataIndex:'Warnings' }
            ]
        });
        if ( this.down('#type_selector') ) {
            this._applyFilter(this.down('#type_selector').getValue());
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
        var store_count = store.getCount();
        csv.push(csv_header_array.join(','));
        for ( var i=0;i<store_count;i++ ) {
            var record = store.getAt(i);
            var row_array = [];
            // escape the quoted bits
            Ext.Array.each(column_index_array, function(index_name){
                var text = '' + record.get(index_name);
                if ( text !== null ) {
                    text = text.replace(/"/g,"'");
                }
                row_array.push('"' + text + '"');
            });
            csv.push(row_array.join(','));
        }
        //this.logger.log("csv",csv.join('\r\n'));
        
        var file_name = "timesheet_export.csv";
        var blob = new Blob([csv.join("\r\n")],{type:'text/csv;charset=utf-8'});
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
    },
    /********************************************
    /* Overrides for App class
    /*
    /********************************************/
    //getSettingsFields:  Override for App    
    getSettingsFields: function() {
        var me = this;
        
        return [{
            name: 'restrict_to_current_user',
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Current User Only:',
            width: 300,
            labelWidth: 150
        }];
    },
    //showSettings:  Override to add showing when external + scrolling
    showSettings: function(options) {
        this.logger.log("showSettings",options);
        this._appSettings = Ext.create('Rally.app.AppSettings', Ext.apply({
            fields: this.getSettingsFields(),
            settings: this.getSettings(),
            defaultSettings: this.getDefaultSettings(),
            context: this.getContext(),
            settingsScope: this.settingsScope
        }, options));

        this._appSettings.on('cancel', this._hideSettings, this);
        this._appSettings.on('save', this._onSettingsSaved, this);
        
        if (this.isExternal()){
            if (this.down('#grid_box').getComponent(this._appSettings.id)==undefined){
                this.down('#grid_box').add(this._appSettings);
            }
        } else {
            this.hide();
            this.up().add(this._appSettings);
        }
        return this._appSettings;
    },
    _onSettingsSaved: function(settings){
        this.logger.log('_onSettingsSaved',settings);
        Ext.apply(this.settings, settings);
        this._hideSettings();
        this.onSettingsUpdate(settings);
    },
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        //Build and save column settings...this means that we need to get the display names and multi-list
        this.logger.log('onSettingsUpdate',settings);        
        this._setUpAndGo();
    },
    isExternal: function(){
      return typeof(this.getAppId()) == 'undefined';
    }
});
