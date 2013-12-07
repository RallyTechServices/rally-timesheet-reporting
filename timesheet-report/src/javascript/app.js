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
                'DisplayName':'Loading',
                'UserName':'', 'ObjectID':-1,
                "Category":"",
                "Department":"",
                "ResourcePool":""
            }]
        });
        
        this._getTeamMembers(this.getContext().getProject().ObjectID).then({
            success: function(records){
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
                            fetch: ['DisplayName','UserName','ObjectID','c_Category','Department','ResourcePool'],
                            callback: function(users, operation, success) {
                                Ext.Array.each(users, function(user) {
                                    me.logger.log(user.get('DisplayName'), user);
                                    me.time_store.add({
                                        "DisplayName":user.get("DisplayName"), 
                                        "UserName":user.get("UserName"),
                                        "ObjectID":user.get("ObjectID"),
                                        "Category":user.get('c_Category'),
                                        "Department":user.get('Department'),
                                        "ResourcePool":user.get('ResourcePool')
                                    });
                                });
                                deferred.resolve([]);
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
        var number_of_team_members = this.time_store.getCount();
        for ( var i=0;i<number_of_team_members;i++ ) {
            var team_member = this.time_store.getAt(i);
            team_member.set('TotalHours',-1);
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
            filters: [
                {property:'TimeEntryItem.User.ObjectID',value:team_member.get('ObjectID')},
                {property:'TimeEntryItem.WeekStartDate',value:start_date}
            ],
            listeners: {
                scope: this,
                load: function(store,records){
                    //this.logger.log(team_member.get('UserName'),records);
                    var hours = 0;
                    Ext.Array.each(records,function(record){
                        var value = record.get('Hours') || 0;
                        hours += value;
                    });
                    team_member.set('TotalHours',hours);
                }
            }
        });
    },
    _makeGrid: function() {        
        var grid = this.down('#grid_box').add({
            xtype:'rallygrid',
            store: this.time_store,
            enableEditing: false,
            sortableColumns: false,
            columnCfgs:[ 
                { text:'Name',dataIndex:'DisplayName', flex: 1},
                { text:'User Name',dataIndex:'UserName',flex:1},
                { text:"Category",dataIndex:'Category'},
                { text:"Department",dataIndex:'Department'},
                { text:"ResourcePool",dataIndex:'ResourcePool'}
            ]
        });
        
    }
});
