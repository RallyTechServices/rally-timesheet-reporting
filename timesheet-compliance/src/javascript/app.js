Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    logger: new Rally.technicalservices.Logger(),
    defaults: { padding: 5, margin: 5 },
    items: [
        {xtype:'container',itemId:'grid_box'},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        var me = this;
        this.logger.log("Launched with context: ",this.getContext());
        
        this.store = Ext.create('Rally.data.custom.Store',{
            data: [{'DisplayName':'Loading','UserName':'', 'ObjectID':-1}]
        });
        
        Ext.create('Rally.data.wsapi.Store',{
            model:'Project',
            filters: [{ property:'ObjectID', value: this.getContext().getProject().ObjectID }],
            autoLoad: true,
            listeners: {
                scope: this,
                load: function(store,records){
                    this.store.removeAll();
                    this.logger.log(records);
                    Ext.Array.each(records, function(project){
                        project.getCollection('TeamMembers').load({
                            scope: this,
                            fetch: ['DisplayName','UserName','ObjectID'],
                            callback: function(users, operation, success) {
                                Ext.Array.each(users, function(user) {
                                    me.logger.log(user.get('DisplayName'));
                                    me.store.add({
                                        "DisplayName":user.get("DisplayName"), 
                                        "UserName":user.get("UserName"),
                                        "ObjectID":user.get("ObjectID")
                                    });
                                });
                            }
                        });
                    });
                }
            }
        });
        
        this._makeGrid();
    },
    _makeGrid: function() {
        this.down('#grid_box').add({
            xtype:'rallygrid',
            store: this.store,
            columnCfgs:[ { text:'Name',dataIndex:'DisplayName', flex: 1} ]
        });
    }
});
