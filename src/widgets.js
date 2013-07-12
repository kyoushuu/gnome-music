/*
 * Copyright (c) 2013 Eslam Mostafa <cseslam@gmail.com>.
 * Copyright (c) 2013 Seif Lotfy <seif@lotfy.com>.
 * Copyright (c) 2013 Vadim Rutkovsky <vrutkovs@redhat.com>.
 *
 * Gnome Music is free software; you can Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * Gnome Music is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Gnome Music; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 */

const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Gd = imports.gi.Gd;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Lang = imports.lang;
const Grl = imports.gi.Grl;
const Pango = imports.gi.Pango;
const Query = imports.query;
const Grilo = imports.grilo;
const Signals = imports.signals;
const GdkPixbuf = imports.gi.GdkPixbuf;

const grilo = Grilo.grilo;
const AlbumArtCache = imports.albumArtCache;
const albumArtCache = AlbumArtCache.AlbumArtCache.getDefault();

const nowPlayingIconName = 'media-playback-start-symbolic';
const errorIconName = 'dialog-error-symbolic';

const LoadMoreButton = new Lang.Class({
    Name: 'LoadMoreButton',
    _init: function(counter) {
        this._block = false;
        this._counter = counter;
        let child = new Gtk.Grid({ column_spacing: 10,
                                   hexpand: false,
                                   halign: Gtk.Align.CENTER,
                                   visible: true });

        this._spinner = new Gtk.Spinner({ halign: Gtk.Align.CENTER,
                                          no_show_all: true });
        this._spinner.set_size_request(16, 16);
        child.add(this._spinner);

        this._label = new Gtk.Label({ label: "Load More",
                                      visible: true });
        child.add(this._label);

        this.widget = new Gtk.Button({ no_show_all: true,
                                       child: child });
        this.widget.get_style_context().add_class('documents-load-more');
        this.widget.connect('clicked', Lang.bind(this,
            function() {
                this._label.label = "Loading...";
                this._spinner.show();
                this._spinner.start();
            }));

        this._onItemCountChanged();
    },

    _onItemCountChanged: function() {
        let remainingDocs = this._counter();
        let visible = !(remainingDocs <= 0 || this._block);
        this.widget.set_visible(visible);

        if (!visible) {
            this._label.label = "Load More";
            this._spinner.stop();
            this._spinner.hide();
        }
    },

    setBlock: function(block) {
        if (this._block == block)
            return;

        this._block = block;
        this._onItemCountChanged();
    }
});

const AlbumWidget = new Lang.Class({
    Name: "AlbumWidget",
    Extends: Gtk.EventBox,

    _init: function (player) {
        this.player = player;
        this.hbox = new Gtk.HBox ();
        this.iterToClean = null;
        this._symbolicIcon = albumArtCache.makeDefaultIcon(256, 256);

        this.ui = new Gtk.Builder();
        this.ui.add_from_resource('/org/gnome/music/AlbumWidget.ui');
        this.model = Gtk.ListStore.new([
                GObject.TYPE_STRING, /*title*/
                GObject.TYPE_STRING,
                GObject.TYPE_STRING,
                GObject.TYPE_STRING,
                GdkPixbuf.Pixbuf,    /*icon*/
                GObject.TYPE_OBJECT, /*song object*/
                GObject.TYPE_BOOLEAN,/* item selected */
                GObject.TYPE_STRING,
                GObject.TYPE_BOOLEAN,
                GObject.TYPE_BOOLEAN,/*icon shown*/
       ]);

        this.view = new Gd.MainView({
            shadow_type:    Gtk.ShadowType.NONE
        });
        this.view.set_view_type(Gd.MainViewType.LIST);
        this.album=null;
        this.view.connect('item-activated', Lang.bind(this,
            function(widget, id, path) {
                let iter = this.model.get_iter(path)[1];
                if (this.model.get_value(iter, 7) != errorIconName) {
                    if (this.iterToClean && this.player.playlistId == this.album){
                        let item = this.model.get_value(this.iterToClean, 5);
                        let title = AlbumArtCache.getMediaTitle(item);
                        this.model.set_value(this.iterToClean, 0, title);
                        // Hide now playing icon
                        this.model.set_value(this.iterToClean, 6, false);
                    }
                    this.player.setPlaylist("Album", this.album, this.model, iter, 5);
                    this.player.setPlaying(true);
                }
            })
        );

        this.parent();

        let view_box = this.ui.get_object("view");
        let child_view = this.view.get_children()[0];
        child_view.set_margin_top(64);
        child_view.set_margin_bottom(64);
        child_view.set_margin_right(32);
        this.view.remove(child_view)
        view_box.add(child_view)

        this.add(this.ui.get_object("AlbumWidget"));
        this._addListRenderers();
        this.get_style_context().add_class("view");
        this.get_style_context().add_class("content-view");
        this.show_all ();
    },

    _addListRenderers: function() {
        let listWidget = this.view.get_generic_view();

        var cols = listWidget.get_columns()
        cols[0].set_min_width(310)
        cols[0].set_max_width(470)
        var cells = cols[0].get_cells()
        cells[2].visible = false
        cells[1].visible = false

        let nowPlayingSymbolRenderer = new Gtk.CellRendererPixbuf({ xpad: 0 });

        var columnNowPlaying = new Gtk.TreeViewColumn();
        nowPlayingSymbolRenderer.xalign = 1.0;
        nowPlayingSymbolRenderer.yalign = 0.6;
        columnNowPlaying.pack_start(nowPlayingSymbolRenderer, false);
        columnNowPlaying.fixed_width = 24;
        columnNowPlaying.add_attribute(nowPlayingSymbolRenderer, "visible", 9);
        columnNowPlaying.add_attribute(nowPlayingSymbolRenderer, "icon_name", 7);
        listWidget.insert_column(columnNowPlaying, 0);

        let typeRenderer =
            new Gd.StyledTextRenderer({ xpad: 16 });
        typeRenderer.ellipsize = Pango.EllipsizeMode.END;
        typeRenderer.xalign = 0.0;
        // This function is not needed, just add the renderer!
        listWidget.add_renderer(typeRenderer, Lang.bind(this,
            function(col, cell, model, iter) {}
        ));
        cols[0].clear_attributes(typeRenderer);
        cols[0].add_attribute(typeRenderer, "markup", 0);

        let durationRenderer = new Gd.StyledTextRenderer({ xpad: 16 });
        durationRenderer.add_class('dim-label');
        durationRenderer.ellipsize = Pango.EllipsizeMode.END;
        durationRenderer.xalign = 1.0;
        listWidget.add_renderer(durationRenderer, Lang.bind(this,
            function(col, cell, model, iter) {
                let item = model.get_value(iter, 5);
                let duration = item.get_duration ();
                if (!item)
                    return;
                durationRenderer.text = this.player.secondsToString(duration);
            }));
    },

    update: function (artist, album, item, header_bar,selection_toolbar) {
        let released_date = item.get_publication_date();
        if (released_date != null) {
            this.ui.get_object("released_label_info").set_text(
                released_date.get_year().toString());
        }
        let duration = 0;
        this.album = album;
        this.ui.get_object("cover").set_from_pixbuf(this._symbolicIcon);
        albumArtCache.lookup(256, artist, item.get_string(Grl.METADATA_KEY_ALBUM), Lang.bind(this,
                    function(pixbuf) {
                        if (pixbuf != null) {
                            this.ui.get_object("cover").set_from_pixbuf(pixbuf);
                            this.model.set(iter, [4], [pixbuf]);
                        }
                    }));



        // if the active queue has been set by this album,
        // use it as model, otherwise build the liststore
        let cachedPlaylist = this.player.runningPlaylist("Album", album);
        if (cachedPlaylist){
            this.model = cachedPlaylist;
            this.updateModel(this.player, cachedPlaylist, this.player.currentTrack);
        } else {
            this.model = Gtk.ListStore.new([
                GObject.TYPE_STRING, /*title*/
                GObject.TYPE_STRING,
                GObject.TYPE_STRING,
                GObject.TYPE_STRING,
                GdkPixbuf.Pixbuf,    /*icon*/
                GObject.TYPE_OBJECT, /*song object*/
                GObject.TYPE_BOOLEAN,/*icon shown*/
                GObject.TYPE_STRING,
                GObject.TYPE_BOOLEAN,
                GObject.TYPE_BOOLEAN,
            ]);
            var tracks = [];
            grilo.getAlbumSongs(item.get_id(), Lang.bind(this, function (source, prefs, track) {
                if (track != null) {
                    tracks.push(track);
                    duration = duration + track.get_duration();
                    let iter = this.model.append();
                    let escapedTitle = AlbumArtCache.getMediaTitle(track, true);
                    try{
                        this.player.discoverer.discover_uri(track.get_url());
                        this.model.set(iter,
                            [0, 1, 2, 3, 4, 5, 7, 9],
                            [ escapedTitle, "", "", "", this._symbolicIcon, track,  nowPlayingIconName, false]);
                    } catch(err) {
                        log(err.message);
                        log("failed to discover url " + track.get_url());
                        this.model.set(iter,
                            [0, 1, 2, 3, 4, 5, 7, 9],
                            [ escapedTitle, "", "", "", this._symbolicIcon, track, true, errorIconName, false]);
                    }

                    this.ui.get_object("running_length_label_info").set_text(
                        (parseInt(duration/60) + 1) + " min");

                    this.emit("track-added")
                }
            }));
        }
        header_bar._selectButton.connect('toggled',Lang.bind(this,function (button) {
            if(button.get_active()){
                this.view.set_selection_mode(true);
                header_bar.setSelectionMode(true);
                this.player.eventBox.set_visible(false);
                selection_toolbar.eventbox.set_visible(true);
                selection_toolbar._add_to_playlist_button.sensitive = false;
            }else{
                this.view.set_selection_mode(false);
                header_bar.setSelectionMode(false);
                header_bar.title = this.album;
                selection_toolbar.eventbox.set_visible(false);
                if(this.player.PlaybackStatus != 'Stopped' ){
                    this.player.eventBox.set_visible(true);
                }
            }
        }));
        header_bar._cancelButton.connect('clicked',Lang.bind(this,function(button){
            this.view.set_selection_mode(false);
            header_bar.setSelectionMode(false);
            header_bar.header_bar.title = this.album;
        }));
        this.view.connect('view-selection-changed',Lang.bind(this,function(){
            let items = this.view.get_selection();
            selection_toolbar._add_to_playlist_button.sensitive = items.length > 0
        }));
        this.view.set_model(this.model);
        let escapedArtist = GLib.markup_escape_text(artist, -1);
        let escapedAlbum = GLib.markup_escape_text(album, -1);
        this.ui.get_object("artist_label").set_markup(escapedArtist);
        this.ui.get_object("title_label").set_markup(escapedAlbum);
        if (item.get_creation_date())
            this.ui.get_object("released_label_info").set_text(item.get_creation_date().get_year().toString());
        else
            this.ui.get_object("released_label_info").set_text("----");
        this.player.connect('playlist-item-changed', Lang.bind(this, this.updateModel));
        this.emit('loaded')

    },

    updateModel: function(player, playlist, currentIter){
        //this is not our playlist, return
        if (playlist != this.model){
            return false;}
        let currentSong = playlist.get_value(currentIter, 5);
        let [res, iter] = playlist.get_iter_first();
        if (!res)
            return false;
        let songPassed = false;
        let iconVisible, title;
        do{
            let song = playlist.get_value(iter, 5);

            let escapedTitle = AlbumArtCache.getMediaTitle(song, true);
            if (song == currentSong){
                title = "<b>" + escapedTitle + "</b>";
                iconVisible = true;
                songPassed = true;
            } else if (songPassed) {
                title = "<span>"+escapedTitle+"</span>";
                iconVisible = false;
            } else {
                title = "<span color='grey'>" + escapedTitle + "</span>";
                iconVisible = false;
            }
            playlist.set_value(iter, 0, title);
            playlist.set_value(iter, 9, iconVisible);
        } while(playlist.iter_next(iter));
        return false;
    },
});
Signals.addSignalMethods(AlbumWidget.prototype);

const ArtistAlbums = new Lang.Class({
    Name: "ArtistAlbumsWidget",
    Extends: Gtk.VBox,

    _init: function (artist, albums, player) {
        this.player = player
        this.artist = artist
        this.albums = albums
        this.parent();
        this.ui = new Gtk.Builder();
        this.ui.add_from_resource('/org/gnome/music/ArtistAlbumsWidget.ui');
        this.set_border_width(0);
        this.ui.get_object("artist").set_label(this.artist);
        this.widgets = [];

        this.model = Gtk.ListStore.new([
                GObject.TYPE_STRING, /*title*/
                GObject.TYPE_STRING,
                GObject.TYPE_STRING,
                GObject.TYPE_BOOLEAN,/*icon shown*/
                GObject.TYPE_STRING, /*icon*/
                GObject.TYPE_OBJECT, /*song object*/
                GObject.TYPE_BOOLEAN
                ]);

        this._hbox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
        this._albumBox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 48});
        this._scrolledWindow = new Gtk.ScrolledWindow();
        this._scrolledWindow.set_policy(
            Gtk.PolicyType.NEVER,
            Gtk.PolicyType.AUTOMATIC);
        this._scrolledWindow.add(this._hbox);
        this._hbox.pack_start(this.ui.get_object("ArtistAlbumsWidget"), false, false, 0);
        this._hbox.pack_start(this._albumBox, false, false, 16);
        this.pack_start(this._scrolledWindow, true, true, 0);

        for (var i=0; i < albums.length; i++)
            this.addAlbum(albums[i]);

        this.show_all();
        this.player.connect('playlist-item-changed', Lang.bind(this, this.updateModel));
        this.emit("albums-loaded");
    },

    addAlbum: function(album) {
        let widget = new ArtistAlbumWidget(this.artist, album, this.player, this.model)
        this._albumBox.pack_start(widget, false, false, 0);
        this.widgets.push(widget);
    },

    updateModel: function(player, playlist, currentIter){
        //this is not our playlist, return
        if (playlist != this.model){
            //TODO, only clean once, but that can wait util we have clean
            //the code a bit, and until the playlist refactoring.
            //the overhead is acceptable for now
            this.cleanModel();
            return false;}
        let currentSong = playlist.get_value(currentIter, 5);
        let [res, iter] = playlist.get_iter_first();
        if (!res)
            return false;
        let songPassed = false;
        do{
            let song = playlist.get_value(iter, 5);
            let songWidget = song.songWidget;

            if (!songWidget.can_be_played)
                continue;

            let escapedTitle = AlbumArtCache.getMediaTitle(song, true);
            if (song == currentSong){
                songWidget.nowPlayingSign.show();
                songWidget.title.set_markup("<b>" + escapedTitle + "</b>");
                songPassed = true;
            } else if (songPassed) {
                songWidget.nowPlayingSign.hide();
                songWidget.title.set_markup("<span>" + escapedTitle + "</span>");
            } else {
                songWidget.nowPlayingSign.hide();
                songWidget.title.set_markup("<span color='grey'>" + escapedTitle + "</span>");
            }
        } while(playlist.iter_next(iter));
        return false;

    },
    cleanModel: function(){
        let [res, iter] = this.model.get_iter_first();
        if (!res)
            return false;
        do{
            let song = this.model.get_value(iter, 5);
            let songWidget = song.songWidget;
            let escapedTitle = AlbumArtCache.getMediaTitle(song, true);
            if (songWidget.can_be_played)
                songWidget.nowPlayingSign.hide();
            songWidget.title.set_markup("<span>" + escapedTitle + "</span>");
        } while(this.model.iter_next(iter));
        return false;

    }
});
Signals.addSignalMethods(ArtistAlbums.prototype);


const AllArtistsAlbums = new Lang.Class({
    Name: "AllArtistsAlbums",
    Extends: ArtistAlbums,

    _init: function(player) {
        this.parent("All Artists", [], player);
        this._offset = 0;
        this.countQuery = Query.album_count;
        this._loadMore = new LoadMoreButton(Lang.bind(this, this._getRemainingItemCount));
        this.pack_end(this._loadMore.widget, false, false, 0);
        this._loadMore.widget.connect("clicked", Lang.bind(this, this._populate))
        this._connectView();
        this._populate();
    },

    _connectView: function() {
        this._adjustmentValueId = this._scrolledWindow.vadjustment.connect(
            'value-changed',
            Lang.bind(this, this._onScrolledWinChange)
        );
        this._adjustmentChangedId = this._scrolledWindow.vadjustment.connect(
            'changed',
            Lang.bind(this, this._onScrolledWinChange)
        );
        this._scrollbarVisibleId = this._scrolledWindow.get_vscrollbar().connect(
            'notify::visible',
            Lang.bind(this, this._onScrolledWinChange)
        );
        this._onScrolledWinChange();
    },

    _onScrolledWinChange: function() {
        let vScrollbar = this._scrolledWindow.get_vscrollbar();
        let adjustment = this._scrolledWindow.vadjustment;
        let revealAreaHeight = 32;

        // if there's no vscrollbar, or if it's not visible, hide the button
        if (!vScrollbar ||
            !vScrollbar.get_visible()) {
            this._loadMore.setBlock(true);
            return;
        }

        let value = adjustment.value;
        let upper = adjustment.upper;
        let page_size = adjustment.page_size;

        let end = false;
        // special case this values which happen at construction
        if ((value == 0) && (upper == 1) && (page_size == 1))
            end = false;
        else
            end = !(value < (upper - page_size - revealAreaHeight));
        if (this._getRemainingItemCount() <= 0)
            end = false;
        this._loadMore.setBlock(!end);
    },


    _populate: function () {
        if (grilo.tracker != null)
            grilo.populateAlbums (this._offset, Lang.bind(this,
                function (source, param, item, remaining) {
                    if (item != null) {
                        this._offset += 1;
                        this.addAlbum(item);
                    }
                }), 5);
    },

    _getRemainingItemCount: function () {let count = -1;
        if (this.countQuery != null) {
            let cursor = Grilo.tracker.query(this.countQuery, null)
            if (cursor != null && cursor.next(null))
                count = cursor.get_integer(0);
        }
        return ( count - this._offset);
    },
});


const ArtistAlbumWidget = new Lang.Class({
    Name: "ArtistAlbumWidget",
    Extends: Gtk.HBox,

    _init: function (artist, album, player, model) {
        this.parent();
        this.player = player;
        this.album = album;
        this.artist = artist;
        this.model = model;
        this.songs = [];

        var track_count = album.get_childcount();

        this.ui = new Gtk.Builder();
        this.ui.add_from_resource('/org/gnome/music/ArtistAlbumWidget.ui');

        let pixbuf = albumArtCache.makeDefaultIcon(128, 128);
        GLib.idle_add(300, Lang.bind(this, this._updateAlbumArt));

        this.ui.get_object("cover").set_from_pixbuf(pixbuf);
        this.ui.get_object("title").set_label(album.get_title());
        if (album.get_creation_date()) {
            this.ui.get_object("year").set_markup(
                "<span color='grey'>(" + album.get_creation_date().get_year() + ")</span>");
        }
        this.tracks = [];
        grilo.getAlbumSongs(album.get_id(), Lang.bind(this, function (source, prefs, track) {
            if (track != null) {
                this.tracks.push(track);
            }
            else {
                for (var i=0; i<this.tracks.length; i++) {
                    let track = this.tracks[i];
                    var ui = new Gtk.Builder();
                    ui.add_from_resource('/org/gnome/music/TrackWidget.ui');
                    var songWidget = ui.get_object("eventbox1");
                    this.songs.push(songWidget);
                    ui.get_object("num").set_markup("<span color='grey'>"+this.songs.length.toString()+"</span>");
                    let title = AlbumArtCache.getMediaTitle(track);
                    ui.get_object('title').set_text(title);
                    //var songWidget = ui.get_object("duration").set_text(track.get_title());
                    ui.get_object("title").set_alignment(0.0, 0.5);
                    this.ui.get_object("grid1").attach(songWidget,
                        parseInt(i/(this.tracks.length/2)),
                        parseInt((i)%(this.tracks.length/2)), 1, 1);
                    track.songWidget = songWidget;
                    let iter = model.append();
                    songWidget.iter = iter;
                    songWidget.model = model;
                    songWidget.title = ui.get_object("title");

                    try{
                        this.player.discoverer.discover_uri(track.get_url());
                        model.set(iter,
                            [0, 1, 2, 3, 4, 5],
                            [ title, '', '', false, nowPlayingIconName, track]);
                        songWidget.nowPlayingSign = ui.get_object("image1");
                        songWidget.nowPlayingSign.set_from_icon_name(nowPlayingIconName, Gtk.IconSize.SMALL_TOOLBAR);
                        songWidget.nowPlayingSign.set_no_show_all("true");
                        songWidget.nowPlayingSign.set_alignment(0.0,0.6);
                        songWidget.can_be_played = true;
                        songWidget.connect('button-release-event', Lang.bind(
                                                                this, this.trackSelected));
                    } catch(err) {
                        log(err.message);
                        log("failed to discover url " + track.get_url());
                        this.model.set(iter,
                            [0, 1, 2, 3, 4, 5],
                            [ title, '', '', true, errorIconName, track ]);
                        songWidget.nowPlayingSign = ui.get_object("image1");
                        songWidget.nowPlayingSign.set_from_icon_name(errorIconName, Gtk.IconSize.SMALL_TOOLBAR);
                        songWidget.nowPlayingSign.set_alignment(0.0,0.6);
                        songWidget.can_be_played = false;
                    }
                }
                this.ui.get_object("grid1").show_all();
                this.emit("tracks-loaded");
            }
        }));

        this.pack_start(this.ui.get_object("ArtistAlbumWidget"), true, true, 0);
        this.show_all();
        this.emit("artist-album-loaded");
    },

    _updateAlbumArt: function() {
        albumArtCache.lookup(128, this.artist, this.album.get_title(), Lang.bind(this,
            function(pixbuf) {
                if (pixbuf != null)
                    this.ui.get_object("cover").set_from_pixbuf(pixbuf);
                else {
                    var options = Grl.OperationOptions.new(null);
                    options.set_flags(Grl.ResolutionFlags.FULL | Grl.ResolutionFlags.IDLE_RELAY);
                    grilo.tracker.resolve(
                        this.album,
                        [Grl.METADATA_KEY_THUMBNAIL],
                        options,
                        Lang.bind(this,
                        function(source, param, item) {
                            var uri = this.album.get_thumbnail();
                            albumArtCache.getFromUri(uri,
                                this.artist,
                                this.album.get_title(),
                                128,
                                128,
                                Lang.bind(this,
                                    function(pixbuf) {
                                        pixbuf = albumArtCache.makeIconFrame(pixbuf);
                                        this.ui.get_object("cover").set_from_pixbuf(pixbuf);
                                    }))
                        }));
                }
            }));
    },

    trackSelected: function(widget, iter) {
        this.player.stop();
        this.player.setPlaylist ("Artist", this.album, widget.model, widget.iter, 5);
        this.player.setPlaying(true);
    },

});
Signals.addSignalMethods(ArtistAlbumWidget.prototype);
