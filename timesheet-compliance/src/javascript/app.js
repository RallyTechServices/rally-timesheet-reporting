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
        {xtype:'tsinfolink'},
        {xtype:'container',itemId:'empty_box'}
    ],
    
    launch: function() {
        var me = this;
        this.logger.log("Launched with context: ",this.getContext());
        
        this.team_store = Ext.create('Rally.data.custom.Store',{
            data: [{'DisplayName':'Loading','UserName':'', 'ObjectID':-1}]
        });
        
        this.compliance_store = Ext.create('Rally.data.custom.Store',{
            data: [{'DisplayName':'Loading','UserName':'', 'ObjectID':-1, 'Period':''}]
        });
        
        this._getTeamMembers(this.getContext().getProject().ObjectID).then({
            success: function(users){
                Ext.Array.each(users, function(user) {
                    me.team_store.add({
                        "DisplayName":user.get("DisplayName"), 
                        "UserName":user.get("UserName"),
                        "ObjectID":user.get("ObjectID")
                    });
                });
                                    
                me._addDateSelectors();
                me._addCheckboxes();
            }
        });
    },
    _addDownloadButton: function() {
        this.down('#save_button_box').add({
            xtype:'rallybutton',
            text:'Export to CSV',
            scope: this,
            handler: function() {
                this._makeCSV();
            }
        });
        
    },
    _addCheckboxes: function() {
        this.down('#select_checks_box').add({
            xtype:'rallycheckboxfield',
            itemId:'check_missing',
            labelWidth: 150,
            labelAlign: 'right',
            fieldLabel:'Show Missing Timesheets',
            value: true,
            listeners: {
                scope: this,
                change: this._applyFilter
            }
        });
        this.down('#select_checks_box').add({
            xtype:'rallycheckboxfield',
            itemId:'check_low',
            labelWidth: 125,
            labelAlign: 'right',
            fieldLabel:'Show Below 37.5',
            value: true,
            listeners: {
                scope: this,
                change: this._applyFilter
            }
        });
        this.down('#select_checks_box').add({
            xtype:'rallycheckboxfield',
            itemId:'check_high',
            labelWidth: 125,
            labelAlign: 'right',
            fieldLabel:'Show Above 67.5',
            value: true,
            listeners: {
                scope: this,
                change: this._applyFilter
            }
        });
        this.down('#select_checks_box').add({
            xtype:'rallycheckboxfield',
            itemId:'check_middle',
            labelWidth: 125,
            labelAlign: 'right',
            fieldLabel:'Show Compliant',
            value: true,
            listeners: {
                scope: this,
                change: this._applyFilter
            }
        });
    },
    _addDateSelectors: function() {
        var me = this;
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
                        setTimeout(function(){
                            me._mask("Gathering timesheet data...",me);
                            me._getTimesheets();
                        },10);
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
                        setTimeout(function(){
                            me._mask("Gathering timesheet data...",me);
                            me._getTimesheets();
                        },10);
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
    _mask: function(text) {
        this.setLoading(text);
    },
    _unmask: function() {
        this.setLoading(false);
    },
    _getTeamMembers: function(project_oid) {
        var me = this;
        var deferred = Ext.create('Deft.Deferred');
        Ext.create('Rally.data.wsapi.Store',{
            model:'Project',
            filters: [{ property:'ObjectID', value: project_oid }],
            fetch: ['TeamMembers','Name','Children'],
            autoLoad: true,
            listeners: {
                scope: this,
                load: function(store,records){
                    this.team_store.removeAll();
                    Ext.Array.each(records, function(project){
                        me.logger.log("project",project);
                        me._mask("Gathering People...");
                        if ( project.get('Children').Count > 0 ) {
                            // get all users
                            me.logger.log("Get all users");
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
                            me.logger.log("Get this team's members");
                            project.getCollection('TeamMembers').load({
                                scope: me,
                                fetch: ['DisplayName','UserName','ObjectID'],
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
    _getTimesheets: function() {
        var me = this;
        this.logger.log("_getTimesheets");
        
        this.compliance_store.clearFilter(true);
        this.compliance_store.removeAll();
        
        var start_end = this._getTimeRange();

        if ( start_end.length == 2 ) {
            var first_week = start_end[0];
            var last_week = start_end[1];
            
            var number_of_team_members = this.team_store.getCount();
            
            var week_start = first_week;
            var promises = [];

            while ( week_start <= last_week ) {
                var week_end = Rally.util.DateTime.add(week_start,'day',6);
                var period = Ext.Date.format(week_start, 'm/d/y') + " - " + Rally.util.DateTime.format(week_end, 'm/d/y');
                
                for ( var i=0;i<number_of_team_members;i++ ) {
                    var team_member = this.team_store.getAt(i);
                    this.compliance_store.add({
                        "DisplayName":team_member.get("DisplayName"), 
                        "UserName":team_member.get("UserName"),
                        "ObjectID":team_member.get("ObjectID"),
                        'TotalHours':-1,
                        'Compliance':"waiting",
                        'Period':period
                    });
                    
                    promises.push(this._getTimesheetForTeamMember(week_start,this.compliance_store.last()));
                }
                week_start = Rally.util.DateTime.add(week_start,'day',7);
            }
            Deft.Promise.all(promises).then({
                success: function(records) {
                    me._applyFilter();
                    me._unmask();
                },
                failure: function(error) {
                  // not trapped yet
                    alert(error);
                }
            });

        }
    },
    _getTimesheetForTeamMember: function(week_start,team_member) {
        this.logger.log("_getTimesheetForTeamMember",week_start,team_member);
        var deferred = Ext.create('Deft.Deferred');
        // force to midnight even in UTC
        var start_date = Rally.util.DateTime.toIsoString(week_start,true).replace(/T.*$/,"T00:00:00.000Z");
        
        Ext.create('Rally.data.wsapi.Store',{
            autoLoad: true,
            model:'TimeEntryValue',
            filters: [
                {property:'TimeEntryItem.User.ObjectID',value:team_member.get('ObjectID')},
                {property:'TimeEntryItem.WeekStartDate',value:start_date}
            ],
            listeners: {
                scope: this,
                load: function(store,records){
                    var me = this;
                    var hours = 0;
                    Ext.Array.each(records,function(record){
                        var value = record.get('Hours') || 0;
                        hours += value;
                    });
                    team_member.set('TotalHours',hours);
                    team_member.set('Compliance',this._getComplianceFromHours(hours));
                    deferred.resolve([team_member]);
                }
            }
        });
        return deferred.promise;
    },
    _applyFilter: function() {
        this.logger.log("Applying Filters");
        this.compliance_store.clearFilter();
        this.compliance_store.filterBy(function(record,id){
            if ( record.get('Hours') === -1 ) {
                return true;
            }
            if ( this.down('#check_missing').getValue() && record.get('Compliance') === 'No Timesheet') {
                return true;
            }
            if ( this.down('#check_low').getValue() && record.get('Compliance') === 'Too Low' ) {
                return true;
            }
            if ( this.down('#check_high').getValue() && record.get('Compliance') === 'Too High' ) {
                return true;
            }
            if ( this.down('#check_middle').getValue() && record.get('Compliance') === 'compliant' ) {
                return true;
            }
            return false;
        },this);
    },
    _getComplianceFromHours: function(hours){
        if ( hours === 0 ) {
            return "No Timesheet";
        }
        if ( hours < 37.5 ) {
            return "Too Low";
        }
        if ( hours > 67.5 ) {
            return "Too High";
        }
        
        return "compliant";
    },
    _makeGrid: function() {
        var color_renderer = this._renderColor;
        
        this.grid = this.down('#grid_box').add({
            xtype:'rallygrid',
            store: this.compliance_store,
            enableEditing: false,
            sortableColumns: false,
            columnCfgs:[ 
                { text:'Name',dataIndex:'DisplayName', flex: 1},
                { text:'User Name',dataIndex:'UserName',flex:1},
                { text:'Period',dataIndex:'Period',flex:1},
                { text:'Hours',dataIndex:'TotalHours', renderer: color_renderer },
                { text:'Compliance',dataIndex:'Compliance', renderer: color_renderer}
            ]
        });
        
        this._mask("Gathering data...");

        
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
    _renderColor: function(value,metaData,record) {
        var compliance = record.get('Compliance');
        var white = "#ffffff";
        var red = '#ff9999';
        var yellow = '#ffffcc';
        var orange ='#FF9933';
        var grey = '#D0D0D0';
        var color = grey;
        
        if ( value > -1 ) {
            color = white;
        }
        if ( compliance == "No Timesheet" ) {
            color = red;
        }
        if ( compliance == "Too Low" ) {
            color = yellow;
        }
        if ( compliance == "Too High" ) {
            color = orange;
        }
        
        if ( compliance == "compliant" ) {
            // value = "";
            color = white;
        }
        
        metaData.style = "background-color: " + color;
        return value;
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
    _getTimeRange: function() {
        this.logger.log("_getTimeRange");
        var start_selector = this.down('#start_date_selector');
        var end_selector = this.down('#end_date_selector');
        
        if ( ! end_selector || ! start_selector ) {
            return [];
        }
        
        var start = start_selector.getValue();
        var end = end_selector.getValue();
                
        if ( ! start || ! end ) {
            return [];
        }
        
        if ( start > end ) { 
            start_selector.setValue(end);
            return [];
        }
        
        return [start,end];
    }
});
