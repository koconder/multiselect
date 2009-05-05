/*
 * jQuery UI Multiselect
 *
 * Authors:
 *	Michael Aufreiter (quasipartikel.at)
 *  Yanick Rochon (yanick.rochon[at]gmail[dot]com)
 * 
 * Dual licensed under the MIT (MIT-LICENSE.txt)
 * and GPL (GPL-LICENSE.txt) licenses.
 * 
 * http://www.quasipartikel.at/multiselect/
 *
 * 
 * Depends:
 *	ui.core.js
 *	ui.sortable.js
 * 
 * Todo:
 *  use Element storage to avoid circular references
 *  $('selector').data()....
 *  Make batch actions faster
 */


// qs_score - Quicksilver Score
// 
// A port of the Quicksilver string ranking algorithm
// 
// "hello world".score("axl") //=> 0.0
// "hello world".score("ow") //=> 0.6
// "hello world".score("hello world") //=> 1.0
//
// Tested in Firefox 2 and Safari 3
//
// The Quicksilver code is available here
// http://code.google.com/p/blacktree-alchemy/
// http://blacktree-alchemy.googlecode.com/svn/trunk/Crucible/Code/NSString+BLTRRanking.m
//
// The MIT License
// 
// Copyright (c) 2008 Lachie Cox
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.


String.prototype.score = function(abbreviation,offset) {
  offset = offset || 0 // TODO: I think this is unused... remove

  if(abbreviation.length == 0) return 0.9
  if(abbreviation.length > this.length) return 0.0

  for (var i = abbreviation.length; i > 0; i--) {
    var sub_abbreviation = abbreviation.substring(0,i)
    var index = this.indexOf(sub_abbreviation)


    if(index < 0) continue;
    if(index + abbreviation.length > this.length + offset) continue;

    var next_string       = this.substring(index+sub_abbreviation.length)
    var next_abbreviation = null

    if(i >= abbreviation.length)
      next_abbreviation = ''
    else
      next_abbreviation = abbreviation.substring(i)

    var remaining_score   = next_string.score(next_abbreviation,offset+index)

    if (remaining_score > 0) {
      var score = this.length-next_string.length;

      if(index != 0) {
        var j = 0;

        var c = this.charCodeAt(index-1)
        if(c==32 || c == 9) {
          for(var j=(index-2); j >= 0; j--) {
            c = this.charCodeAt(j)
            score -= ((c == 32 || c == 9) ? 1 : 0.15)
          }

          // XXX maybe not port this heuristic
          // 
          //          } else if ([[NSCharacterSet uppercaseLetterCharacterSet] characterIsMember:[self characterAtIndex:matchedRange.location]]) {
          //            for (j = matchedRange.location-1; j >= (int) searchRange.location; j--) {
          //              if ([[NSCharacterSet uppercaseLetterCharacterSet] characterIsMember:[self characterAtIndex:j]])
          //                score--;
          //              else
          //                score -= 0.15;
          //            }
        } else {
          score -= index
        }
      }

      score += remaining_score * next_string.length
      score /= this.length;
      return score
    }
  }
  return 0.0
};
 

(function($) {

$.widget("ui.multiselect", {
  _init: function() {
		// hide this.element
		this.element.hide();
		this.id = this.element.attr("id");
		this.container = $('<div class="ui-multiselect ui-helper-clearfix ui-widget"></div>').insertAfter(this.element);
		this.count = 0; // number of currently selected options
		this.selectedContainer = $('<div class="selected"></div>').appendTo(this.container);
		this.availableContainer = $('<div class="available"></div>').appendTo(this.container);
		this.selectedActions = $('<div class="actions ui-widget-header ui-helper-clearfix"><span class="count">0 items selected</span><a href="#" class="remove-all">Remove All</a></div>').appendTo(this.selectedContainer);
		this.availableActions = $('<div class="actions ui-widget-header ui-helper-clearfix"><form method="get" class="search-form"><input type="text" class="search ui-widget-content ui-corner-all"/></form><a href="#" class="add-all">Add All</a></div>').appendTo(this.availableContainer);
		this.selectedList = $('<ul class="selected"></ul>').bind('selectstart', function(){return false;}).appendTo(this.selectedContainer);
		this.availableList = $('<ul class="available"></ul>').bind('selectstart', function(){return false;}).appendTo(this.availableContainer);
		
		var that = this;

		// set dimensions
		this.container.width(this.element.width()+1);
		this.selectedList.width(this.element.width()*0.6);
		this.availableList.width(this.element.width()*0.4);

		this.selectedList.height(this.element.height());
		this.availableList.height(this.element.height());
		
		if ( !this.options.animated ) {
			this.options.show = 'show';
			this.options.hide = 'hide';
		}
		
		// init lists
		this._populateLists(this.element.find('option'));
		
		// register events
		this._registerAddEvents(this.availableList.find('a.action'));
		this._registerRemoveEvents(this.selectedList.find('a.action'));
		
		// make selection sortable
		if (this.options.sortable) {
			$(this.selectedList).sortable({
			  containment: 'parent',
			  update: function(event, ui) {
			    // apply the new sort order to the original selectbox
			    that.selectedList.find('li').each(function() {
			      if (this.optionLink) $(this.optionLink).remove().appendTo(that.element);
			    });
			  }
			});
		}
		
		// set up livesearch
		if (this.options.searchable) {
			this.availableContainer.find('input.search')
				.keyup(function() {
					that._filter.apply(this, [that.availableList]);
				}).keyup()
				.parents('form').submit(function(){
					return false;
				});
		}
		
		// remove-all
		$(".remove-all").click(function() {
			that.selectedList.find('li').each(function() { that._setSelected($(this), false);	});
			that.count = 0;
			that._updateCount();
			return false;
		});
		
		// add-all
		$(".add-all").click(function() {
			that.availableList.find('li').each(function() { that._setSelected($(this), true); });
			that.count = that.element.find('option').size();
			that._updateCount();
			return false;
		});
  },
	destroy: function() {
		this.element.show();
		this.container.remove();

		$.widget.prototype.destroy.apply(this, arguments);
	},
  _populateLists: function(options) {
    this.selectedList.empty();
    this.availableList.empty();
		this.selectedList.children('*').each(function() { this.itemLink = null; }); // cleanup
    
    var that = this;
    var items = $(options.map(function(i) {
      var item = that._getOptionNode(this).appendTo(this.selected ? that.selectedList : that.availableList).show();
			if (this.selected) that.count += 1;
			that._applyItemState(item);
			item[0].idx = i;
			return item[0];
    }));
		
		this._registerHoverEvents(this.container.find('li'));
		
		// update count
		this._updateCount();
  },
	_updateCount: function() {
		this.selectedContainer.find('span.count').text(this.count+" items selected");
	},
	_getOptionNode: function(option) {
		var node = $('<li class="ui-state-default"> \
			<span class="ui-icon"/> \
			'+$(option).text()+'\
			<a href="#" class="action"><span class="ui-corner-all ui-icon"/></a> \
			</li>').hide();
		node[0].optionLink = option;
		return node;
	},
	_setSelected: function(item, selected) {
		try {
			item[0].optionLink.selected = selected;
		} catch (e) {
			/* @HACK: ignore - IE6 complaints for norhing as the attribute was indeed properly set! (yr - 2009-04-28) */
		}

		if ( selected ) {
			// clone the item
			var selectedItem = item.clone(); selectedItem[0].optionLink = item[0].optionLink; selectedItem[0].idx = item[0].idx;
			item[this.options.hide](this.options.animated, function() { $(this).remove(); });
			selectedItem.appendTo(this.selectedList).hide()[this.options.show](this.options.animated);
			
			this._applyItemState(selectedItem);
			this._registerHoverEvents(selectedItem);
			this._registerRemoveEvents(selectedItem.find('a.action'));

		} else {
			
			// look for successor based on initial option index
			var items = this.availableList.find('li');
			var succ = null; var i = 0;
			while (i<items.length) {
				if ((i==0 && items[i].idx > item[0].idx) || ((items[i].idx > item[0].idx) && (items[i-1].idx < item[0].idx))) {
					succ = items[i];
					break;
				}
				i++;
			}
			
			// clone the item
			var availableItem = item.clone(); availableItem[0].optionLink = item[0].optionLink; availableItem[0].idx = item[0].idx;
			succ ? availableItem.insertBefore($(succ)) : availableItem.appendTo(this.availableList);
			item[this.options.hide](this.options.animated, function() { $(this).remove(); });
			availableItem.hide()[this.options.show](this.options.animated);
			
			this._applyItemState(availableItem);
			this._registerHoverEvents(availableItem);
			this._registerAddEvents(availableItem.find('a.action'));
		}
	},
	_applyItemState: function(item) {
		if (item[0].optionLink.selected) {
			// item.removeClass('ui-priority-secondary');
			if (this.options.sortable)
				item.find('span:first').addClass('ui-icon-arrowthick-2-n-s').removeClass('ui-helper-hidden').addClass('ui-icon');
			else
				item.find('span:first').removeClass('ui-icon-arrowthick-2-n-s').addClass('ui-helper-hidden').removeClass('ui-icon');
			item.find('a.action span').addClass('ui-icon-minus').removeClass('ui-icon-plus');
		} else {
			// item.addClass('ui-priority-secondary');
			item.find('span:first').removeClass('ui-icon-arrowthick-2-n-s').addClass('ui-helper-hidden').removeClass('ui-icon');
			item.find('a.action span').addClass('ui-icon-plus').removeClass('ui-icon-minus');
		}
	},
	// taken from John Resig's liveUpdate script
	_filter: function(list) {
		var rows = list.children('li'),
			cache = rows.map(function(){
				return this.innerHTML.toLowerCase();
			});
		
		var term = $.trim( $(this).val().toLowerCase() ), scores = [];

		if ( !term ) {
			rows.show();
		} else {
			rows.hide();

			cache.each(function(i) {
				var score = this.score(term);
				if (score > 0) { scores.push([score, i]); }
			});

			$.each(scores.sort(function(a, b){return b[0] - a[0];}), function() {
				$(rows[ this[1] ]).show();
			});
		}
	},
	_registerHoverEvents: function(elements) {
		elements.removeClass('ui-state-hover');
		elements.mouseover(function() {
			$(this).addClass('ui-state-hover');
		});
		elements.mouseout(function() {
			$(this).removeClass('ui-state-hover');
		});
	},
	_registerAddEvents: function(elements) {
    var that = this;
    elements.click(function() {
			var item = that._setSelected($(this).parent(), true);
			that.count += 1;
			that._updateCount();
			return false;
    });
  },
  _registerRemoveEvents: function(elements) {
    var that = this;
    elements.click(function() {
			that._setSelected($(this).parent(), false);
			that.count -= 1;
			that._updateCount();
			return false;
    });
  }
});
		
$.extend($.ui.multiselect, {
	defaults: {
		sortable: true,
		searchable: true,
		animated: 'fast',
		show: 'slideDown',
		hide: 'slideUp'
	}
});
	
})(jQuery);