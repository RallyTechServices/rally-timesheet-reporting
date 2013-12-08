Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    logger: new Rally.technicalservices.Logger(),
    defaults: { padding: 5, margin: 5 },
    items: [
        {xtype:'container',itemId:'date_selector_box'}, 
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
                me._addDateSelector();
            }
        });
    },
    _addDateSelector: function() {
        var selector = this.down('#date_selector_box').add({
            xtype:'rallydatefield',
            fieldLabel: 'Week beginning',
            listeners: {
                scope: this,
                change: function(dp, new_value) {
                    var week_start = this._getBeginningOfWeek(new_value);
                    if ( week_start !== new_value ) {
                        dp.setValue(week_start);
                    }
                    if ( new_value.getDay() === 0 ) {
                        this._getTimesheets(new_value);
                    }
                }
            }
        });
        selector.setValue(new Date());
    },
    _getBeginningOfWeek: function(js_date){
        var start_of_week_here = Ext.Date.add(js_date, Ext.Date.DAY, -1 * js_date.getDay());
        return start_of_week_here;
    },
    _getTeamMembers: function(project_oid) {
        var me = this;
        var deferred = Ext.create('Deft.Deferred');
        Ext.create('Rally.data.wsapi.Store',{
            model:'Project',
            filters: [{ property:'ObjectID', value: project_oid }],
            autoLoad: true,
            listeners: {
                scope: this,
                load: function(store,records){
                    this.time_store.removeAll();
                    Ext.Array.each(records, function(project){
                        project.getCollection('TeamMembers').load({
                            scope: this,
                            fetch: ['DisplayName','UserName','ObjectID','Category','Department','ResourcePool'],
                            callback: function(users, operation, success) {
                                console.log('here');
                                deferred.resolve(users);
                            }
                        });
                    });
                }
            }
        });
        
        this._makeGrid();
        return deferred.promise;
    },
    _getTimesheets: function(week_start) {
        this.logger.log("_getTimesheets",week_start);
        this.time_store.clearFilter();
        this.time_store.removeAll();
        
        var number_of_team_members = this.team_members.length;
        
        for ( var i=0;i<number_of_team_members;i++ ) {
            var team_member = this.team_members[i];
            this._getTimesheetForTeamMember(week_start,team_member);
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
            var wp_display = record.get('TimeEntryItem').WorkProductDisplayString;
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
        var grid = this.down('#grid_box').add({
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
        
    }
});
