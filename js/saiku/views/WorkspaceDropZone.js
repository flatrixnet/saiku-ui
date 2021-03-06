/*  
 *   Copyright 2012 OSBI Ltd
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 */
 
/**
 * Sets up workspace drop zones for DnD and other interaction
 */
var WorkspaceDropZone = Backbone.View.extend({
    template: function() {
        var template = $("#template-workspace-dropzones").html() || "";
        return _.template(template)();
    },
    
    events: {
        'sortbeforestop': 'select_dimension',
        'click .d_dimension span.selections': 'selections',
        'click .d_dimension a': 'selections',
        'click .d_measure a' : 'remove_dimension',
        'click .d_measure span.sort' : 'sort_measure',
        'click .d_dimension span.sort' : 'sort_measure',
        'click .limit' : 'limit_axis'
    },
    
    initialize: function(args) {
        // Keep track of parent workspace
        this.workspace = args.workspace;
        
        // Maintain `this` in jQuery event handlers
        _.bindAll(this, "select_dimension", "move_dimension", 
                "remove_dimension", "update_selections","sort_measure", "limit_axis", "set_query_axis", "set_query_axis_filter");
    },
    
    render: function() {
        // Generate drop zones from template
        $(this.el).html(this.template());
        
        // Activate drop zones
        $(this.el).find('.connectable').sortable({
            connectWith: $(this.el).find('.connectable'),
            cursorAt: {
                top: 10,
                left: 35
            },
            forcePlaceholderSize: true,
            items: '> li',
            opacity: 0.60,
            placeholder: 'placeholder',
            tolerance: 'pointer',
            
            start: function(event, ui) {
                ui.placeholder.text(ui.helper.text());
            }

        });
        
        return this; 
    },
    limit_axis: function(event) {
        var self = this;
        
        if (typeof this.workspace.query == "undefined") {
            return false;
        }
        if (this.workspace.query.get('type') != 'QM' || Settings.MODE == "view") {
            return false;
        }
        $axis = $(event.target).siblings('.fields_list_body');
        var source = "";
        var target = "ROWS";
        if ($axis.hasClass('rows')) { target = "ROWS";  }
        if ($axis.hasClass('columns')) { target = "COLUMNS";  }
        if ($axis.hasClass('filter')) { target = "FILTER";  }


        $target =  $(event.target).hasClass('limit') ? $(event.target) : $(event.target).parent();
        $body = $(document);
        $body.off('.contextMenu .contextMenuAutoHide');
        $('.context-menu-list').remove();
        $.contextMenu('destroy');
        $.contextMenu({
            appendTo: $target,
            selector: '.limit', 
            ignoreRightClick: true,
             build: function($trigger, e) {
                var query = self.workspace.query;
                var schema = query.get('schema');
                var cube = query.get('connection') + "/" + 
                    query.get('catalog') + "/"
                    + ((schema == "" || schema == null) ? "null" : schema) 
                    + "/" + query.get('cube');

                var items = {};
                var measures = Saiku.session.sessionworkspace.measures[cube].get('data');

                var func, n, sortliteral, filterCondition;
                var quick = "";
                var isFilter = false;
                var axes = self.workspace.query.get('axes');
                _.each(axes, function(a) {
                    if (a.name == target) {
                        func = a.limitFunction;
                        n = a.limitFunctionN;
                        sortliteral = a.limitFunctionSortLiteral;
                        filterCondition = a.filterCondition;
                        isFilter = (a.filterCondition != null);
                    }
                });

                if (func != null && sortliteral == null) {
                    quick = func + "###SEPARATOR###" + n;
                } else if (func != null && sortliteral != null && n != null) {
                    quick = "custom";
                }

                _.each(measures, function(measure) {
                    items[measure.uniqueName] = {
                        name: measure.caption,
                        payload: {
                            "n"     : 10,
                            "sortliteral"    : measure.uniqueName
                        }
                    };
                });


                var addFun = function(items, fun) {
                    var ret = {};
                    for (key in items) {
                        ret[ (fun + '###SEPARATOR###'+ key) ] = _.clone(items[key]);
                        ret[ (fun + '###SEPARATOR###' + key) ].fun = fun;
                        if (fun == func && sortliteral == key && items[key].payload["n"] == n) {
                            ret[ (fun + '###SEPARATOR###' + key) ].name =
                                    "<b>" + items[key].name + "</b>";
                            quick = fun + "Quick";
                        }
                    }
                    return ret;
                }

                var citems = {
                        "namefilter" : {name: "<b>Filter</b>", disabled: true },
                        "customfilter": {name: "Custom..." },
                        "clearfilter": {name: "Clear Filter" },
                        "empty" : {name: "&nbsp; ", disabled: true },
                        "sep1": "---------",
                        "namelimit" : {name: "<b>Limit</b>", disabled: true },
                        "TopCount###SEPARATOR###10": {name: "Top 10" },
                        "BottomCount###SEPARATOR###10": {name: "Bottom 10" }
                };
                citems["TopCountQuick"] = {
                        name: "Top 10 by...",
                        items: addFun(items, "TopCount")
                };
                citems["BottomCountQuick"] = {
                        name: "Bottom 10 by...",
                        items: addFun(items, "BottomCount")
                };


                citems["custom"] = {
                        name: "Custom..."
                };

                citems["clear"] = {
                        name: "Clear Limit"
                };
                items["10"] = {
                   payload: { "n" : 10 }
                }

                if (quick in citems) {
                    citems[quick].name = "<b>" + citems[quick].name + "</b>";
                }
                if (isFilter) {
                    citems["customfilter"].name = "<b>" + citems["customfilter"].name + "</b>";
                }

                return {
                    callback: function(key, options) {
                            if (key == "clearfilter") {
                                $target.removeClass('on');
                                var url = "/axis/" + target + "/filter";
                                self.set_query_axis_filter(target, null);
                                self.workspace.query.action.del(url, {
                                    success: self.workspace.query.run
                                });
                            } else if (key == "customfilter") {
                                var save_custom = function(filterCondition) {
                                    self.set_query_axis_filter(target, filterCondition);
                                    var url = "/axis/" + target + "/filter/" ;
                                    self.workspace.query.action.post(url, {
                                        success: self.workspace.query.run, data : { filterCondition: filterCondition }
                                    });    
                                };

                                 (new FilterModal({ 
                                    axis: target,
                                    success: save_custom, 
                                    query: self.workspace.query,
                                    filterCondition: filterCondition
                                })).render().open();

                            } else if (key == "clear") {
                                $target.removeClass('on');
                                var url = "/axis/" + target + "/limit";
                                self.set_query_axis(target, null, null, "");
                                self.workspace.query.action.del(url, {
                                    success: self.workspace.query.run
                                });
                            } else if (key == "custom") {

                                var save_custom = function(fun, n, sortliteral) {
                                    self.set_query_axis(target, fun, n, sortliteral);
                                    var url = "/axis/" + target + "/limit/" + fun;
                                    self.workspace.query.action.post(url, {
                                        success: self.workspace.query.run, data : { n: n, sortliteral: sortliteral }
                                    });    
                                };

                                 (new CustomFilterModal({ 
                                    axis: target,
                                    measures: measures,
                                    success: save_custom, 
                                    query: self.workspace.query,
                                    func: func,
                                    n: n,
                                    sortliteral: sortliteral
                                })).render().open();
                            } else {
                                var fun = key.split('###SEPARATOR###')[0];
                                var ikey = key.split('###SEPARATOR###')[1];
                                self.set_query_axis(target, fun, items[ikey].payload.n , items[ikey].payload["sortliteral"]);
                                var url = "/axis/" + target + "/limit/" + fun;
                                self.workspace.query.action.post(url, {
                                    success: self.workspace.query.run, data : items[ikey].payload
                                });
                            }

                    },
                    items: citems
                } 
            }
        });
    $target.contextMenu();


    },

    set_query_axis_filter: function(target, filterCondition) {
        var self = this;
        var axes = this.workspace.query.get('axes');
        _.each(axes, function(axis) {
            if (axis.name == target) {
                axis.filterCondition = filterCondition;
                if (axis.limitFunction !=  null || axis.filterCondition != null) {
                    $(self.el).find('.fields_list[title="' + target + '"] .limit').addClass('on');
                } else {
                    $(self.el).find('.fields_list[title="' + target + '"] .limit').removeClass('on');
                }
                return false;
            }
        });
        return false;
    },

        set_query_axis: function(target, func, n, sortliteral) {
        var self = this;
        var axes = this.workspace.query.get('axes');
        _.each(axes, function(axis) {
            if (axis.name == target) {
                axis.limitFunction = func;
                axis.limitFunctionN = n;
                axis.limitFunctionSortLiteral = sortliteral;
                if (axis.limitFunction !=  null || axis.filterCondition != null) {
                    $(self.el).find('.fields_list[title="' + target + '"] .limit').addClass('on');
                } else {
                    $(self.el).find('.fields_list[title="' + target + '"] .limit').removeClass('on');
                }
                return false;
            }
        });
        return false;
    },


    sort_measure: function(event, ui) {
        $axis = $(event.target).parent().parents('.fields_list_body');
        var source = "";
        var target = "ROWS";
        
        if ($axis.hasClass('rows')) { source = "ROWS"; target= "COLUMNS"; }
        if ($axis.hasClass('columns')) { source = "COLUMNS"; target="ROWS"; }
        if ($axis.hasClass('filter')) { source = "FILTER"; target="COLUMNS"; }

        var sortOrder = "";
        if ($(event.target).hasClass('none')) sortOrder = "none";
        if ($(event.target).hasClass('BASC')) sortOrder = "BASC";
        if ($(event.target).hasClass('BDESC')) sortOrder = "BDESC";

        var memberpath = $(event.target).parent().find('a').attr('href').replace('#', '').split('/');
        var member = "-";
        if ($(event.target).parent().hasClass('d_dimension')) {
            member = memberpath[2] + ".CurrentMember.Name";
            $axis.find('.d_dimension .sort').removeClass('BASC').removeClass('BDESC').addClass('none');
            $axis.parent().parent().find("." + target.toLowerCase() + " .d_measure .sort").removeClass('BASC').removeClass('BDESC').addClass('none');
            target = source;
        } else {
            member = memberpath[memberpath.length -1];
            $axis.find('.d_measure .sort').removeClass('BASC').removeClass('BDESC').addClass('none');
            $axis.parent().parent().find("." + target.toLowerCase() + " .d_dimension .sort").removeClass('BASC').removeClass('BDESC').addClass('none');
        }

        var futureSortOrder = "none";
        if (sortOrder == "none") futureSortOrder = "BASC";
        if (sortOrder == "BASC") futureSortOrder = "BDESC";
        if (sortOrder == "BDESC") futureSortOrder = "none";
        


        $(event.target).removeClass('none').addClass(futureSortOrder);

        if (futureSortOrder == "none") {
            var url = "/axis/" + target + "/sort/";
            this.workspace.query.action.del(url, {
                success: this.workspace.query.run
            });
        } else {
            var url = "/axis/" + target + "/sort/" + futureSortOrder + "/" + member;
            this.workspace.query.action.post(url, {
                success: this.workspace.query.run
            });
        }

    },
    
    select_dimension: function(event, ui) {

        $axis = ui.item.parents('.fields_list_body');
        var target = "";
        
        if ($axis.hasClass('rows')) target = "ROWS";
        if ($axis.hasClass('columns')) target = "COLUMNS";
        if ($axis.hasClass('filter')) target = "FILTER";


        // Short circuit if this is a move
        if (ui.item.hasClass('d_measure') ||
                ui.item.hasClass('d_dimension')) {
            this.move_dimension(event, ui, target);
            return;
        }

        // Make the element and its parent bold
        var original_href = ui.item.find('a').attr('href');
        var $original = $(this.workspace.el).find('.sidebar')
            .find('a[href="' + original_href + '"]').parent('li');
        $original
            .css({fontWeight: "bold"})
            .draggable('disable');
        $original.parents('.parent_dimension')
            .find('.folder_collapsed')
            .css({fontWeight: "bold"});
        

        // Wrap with the appropriate parent element
        if (ui.item.find('a').hasClass('level')) {
            var $icon = $("<div />").addClass('sprite').addClass('selections');
            var $icon2 = $("<span />").addClass('sprite').addClass('sort none');
        
            ui.item.addClass('d_dimension').prepend($icon);
            ui.item.addClass('d_dimension').prepend($icon2);
        } else {
            var $icon = $("<span />").addClass('sort none');
            ui.item.addClass('d_measure').prepend($icon);
        }



        var member = ui.item.find('a').attr('href').replace('#', '');
        var dimension = member.split('/')[0];
        var dimensions = [];

        this.update_selections(event,ui);

        $axis.find('a').each( function(i,element) {
            var imember = $(element).attr('href');
            var idimension = imember.replace('#', '').split('/')[0]; 
            if (dimensions.indexOf(idimension) == -1) {
                dimensions.push(idimension);
            }
        });

        var index = dimensions.indexOf(dimension);


        // Notify the model of the change
        this.workspace.query.move_dimension(member, 
                target, index);

        if ("FILTER" == target && ui.item.hasClass('d_dimension')) {
                var ev = { target : $axis.find('a[href="#' + member + '"]') };
                this.selections(ev, ui);
        }

        // Prevent workspace from getting this event
        return true;
    },
    
    move_dimension: function(event, ui, target) {
        if (! ui.item.hasClass('deleted')) {
            $axis = ui.item.parents('.fields_list_body');

            // Notify the model of the change
            var dimension = ui.item.find('a').attr('href').replace('#', '').split('/')[0];
            var dimensions = [];

            this.update_selections(event,ui);

            $axis.find('a').each( function(i,element) {
                var imember = $(element).attr('href');
                var idimension = imember.replace('#', '').split('/')[0]; 
                if (dimensions.indexOf(idimension) == -1) {
                    dimensions.push(idimension);
                }
            });
            var index = dimensions.indexOf(dimension);

            
                this.workspace.query.move_dimension(dimension, 
                    target, index);
        }
        
        // Prevent workspace from getting this event
        event.stopPropagation();
        return false;
    },

    update_selections: function(event, ui) {
        var member = ui.item.find('a').attr('href');
        var dimension = member.replace('#', '').split('/')[0];
        var index = ui.item.parent('.connectable').children().index(ui.item);
        var axis = ui.item.parents('.fields_list_body');
        var allAxes = axis.parent().parent();
        var target = '';
        var source = '';
        var myself = this;
        var $originalItem =  $(myself.workspace.el).find('.sidebar')
                                    .find('a[href="' + member + '"]').parent();
        var insertElement = $(ui.item);
        var type = $(ui.item).hasClass('d_dimension') ? "d_dimension" : "d_measure";

        var sourceAxis = "";
        if ($axis.hasClass('rows')) sourceAxis = "ROWS";
        if ($axis.hasClass('columns')) sourceAxis = "COLUMNS";
        if ($axis.hasClass('filter')) sourceAxis = "FILTER";

        source = ".rows, .columns, .filter";
        allAxes.find(source).find('a').each( function(index, element) {
            var p_member = $(element).attr('href').replace('#', '');
            var p_dimension = p_member.split('/')[0];
            if (p_dimension == dimension && (( "#" + p_member) != member )) {
                $(element).parent().remove();
            }
        });
        
        var n_dimension = null;
        var p_dimension = null;

        
        var prev = $(ui.item).prev();
        if (prev && prev.length > 0) {
            var p_member = prev.find('a').attr('href');
            p_dimension = p_member.replace('#', '').split('/')[0];
        }
        var next = $(ui.placeholder).next();

        while (p_dimension != null && next && next.length > 0 ) {
            var n_member = next.find('a').attr('href');
            n_dimension = n_member.replace('#', '').split('/')[0]; 
            if (p_dimension == n_dimension) {
                next.insertBefore($(ui.item));
            } else {
                p_dimension = null;
            }
            next = $(ui.placeholder).next();
        }
            

        $originalItem.parent().find('.ui-draggable-disabled').clone().attr('class', 'ui-draggable').removeAttr('style')
                                .addClass(type)
                                .insertAfter(insertElement);
        

        axis.find('.d_dimension a').each( function(index, element) {
            element = $(element);
            if (!element.prev() || (element.prev() && element.prev().length == 0)) {
                var $icon = $("<span />").addClass('sprite').addClass('selections');
                $icon.insertBefore(element);
                var $icon = $("<span />").addClass('sprite').addClass('sort none');
                $icon.insertBefore(element);
            }
        });

        axis.find('.d_measure a, .d_dimension a').each( function(index, element) {
            element = $(element);
            if (!element.prev() || (element.prev() && element.prev().length == 0)) {
                if (sourceAxis != "FILTER") {
                    var $icon = $("<span />").addClass('sort none');
                    $icon.insertBefore(element);
                }
                
            }
        });

        $(ui.item).remove();

    },


    remove_dimension: function(event, ui) {
        // Reenable original element
        var $source = ui ? ui.draggable : $(event.target).parent();
        var original_href = $source.find('a').attr('href');
        var $original = $(this.workspace.el).find('.sidebar')
            .find('a[href="' + original_href + '"]').parent('li');
        $original
            .draggable('enable')
            .css({ fontWeight: 'normal' });
        
        // Unhighlight the parent if applicable
        if ($original.parents('.parent_dimension')
                .children().children('.ui-state-disabled').length === 0) {
            $original.parents('.parent_dimension')
                .find('.folder_collapsed')
                .css({fontWeight: "normal"});
        }
        
        // Notify server
        var target = '';
        var dimension = original_href.replace('#', '');
        $target_el = $source.parent().parent('div.fields_list_body');
        if ($target_el.hasClass('rows')) target = "ROWS";
        if ($target_el.hasClass('columns')) target = "COLUMNS";
        if ($target_el.hasClass('filter')) target = "FILTER";
        
        var url = "/axis/" + target + "/dimension/" + dimension;
        this.workspace.query.action.del(url, {
            success: this.workspace.query.run
        });
        
        // Remove element
        $source.addClass('deleted').remove();
        
        // Prevent workspace from getting this event
        event.stopPropagation();
        event.preventDefault();
        return false;
    },
    
    selections: function(event, ui) {
        // Determine dimension
        var $target = $(event.target).hasClass('sprite') ?
            $(event.target).parent().find('.level') :
            $(event.target);
        var key = $target.attr('href').replace('#', '');
        
        // Launch selections dialog
        (new SelectionsModal({
            target: $target,
            name: $target.text(),
            key: key,
            workspace: this.workspace
        })).open();
        
        // Prevent default action
        try {
            event.preventDefault();
        } catch (e) { }
        return false;
    }
});
