var videoweb = function() {
    var player, origWidth, origHeight;
    var videofiles = [], clips = [];
    var currentvideo = {}, currentclip = {};

    $(document).ready(function() {
        player = videojs("video-object");

        setupFileReader();

        origWidth = $("#video-object").width();
        origHeight = $("#video-object").height();

        resizePlayer();
        $(window).resize(resizePlayer);

        $("input.color").change(function(e) {
            $(this).css("background-color", $(this).val());
        });

        $("input.datepicker").datepicker({dateFormat: "yy-mm-dd"});
    });

    function formatTime(seconds) {
        var minutes = parseInt(seconds / 60);
        seconds = seconds % 60;

        var str = (minutes < 10 ? "0" : "") + minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
        return str;
    }

    function resizePlayer() {
        var newWidth, newHeight;

        newWidth = Math.min($(window).width() - 500, origWidth);
        newHeight = Math.floor(newWidth * (origHeight / origWidth));

        $("#video-object")
            .attr("height", newHeight)
            .attr("width", newWidth)
            .css({"height": newHeight, "width": newWidth});

        $(".boxes").css("left", newWidth + 20);
    }

    function updateCurrentClip() {
        if(currentclip.start) {
            $("#clip-start").val(formatTime(currentclip.start));
        } else {
            $("#clip-start").val("");
        }

        if(currentclip.end) {
            $("#clip-end").val(formatTime(currentclip.end));
        } else {
            $("#clip-end").val("");
        }
    }

    function updateVideoFiles() {
        var container = $(".files-loaded .inputs");
        container.empty();
        $.each(videofiles, function(i, videofile) {
            $("<div/>").addClass("row selectable").text(videofile.filename).attr("videourl", videofile.url).appendTo(container);
        });

        container.children(".row").click(selectVideoFile);
    }

    function updateClipList() {
        var container = $(".video-clips .inputs");
        container.empty();
        $.each(clips, function(i, clip) {
            console.log(clip);

            var infocells = [
                $("<div/>").addClass("").text(clip.file),
                $("<div/>").addClass("").text(formatTime(clip.start)),
                $("<div/>").addClass("").text(formatTime(clip.end))
            ];

            $("<div/>").addClass("row selectable").attr("start", clip.start).append(infocells).appendTo(container);
        });

        container.children(".row").click(selectVideoFile);
    }

    function selectVideoFile() {
        var $this = $(this);
        $this.closest(".inputs").children(".selectable").removeClass("selected");
        $this.addClass("selected");

        $.each(videofiles, function(i, videofile) {
            if(videofile.url == $this.attr("videourl")) {
                currentvideo = videofile;
            }
        });

        $("video").attr("src", $this.attr("videourl"));
    }

    function saveCurrentClip() {
        if(currentclip.start && currentclip.end) {
            clips.push(currentclip);
            currentclip = {};
            updateClipList();
            updateCurrentClip();
        }
    }

    function divDrop(e) {
        e.preventDefault();

        e.dropEffect = "link";

        var reader = new FileReader();
        $.each(e.originalEvent.dataTransfer.files, function(i, file) {
            var videourl = window.URL.createObjectURL(file);

            videofiles.push({"url": videourl, "filename": file.name});
        });

        updateVideoFiles();
    }

    function readKey(e) {
        console.log(e.which);

        switch(e.which) {
        case 73:  // I
            currentclip.start = player.currentTime();
            currentclip.file = currentvideo.filename;
            console.log(currentvideo);
            updateCurrentClip();
            break;

        case 79:  // O
            currentclip.end = player.currentTime();
            updateCurrentClip();
            break;

        case 65:  // A
            saveCurrentClip();
            break;

        case 71:  // G
            console.log("GOAL at %s", player.currentTime());
            break;

        case 84:  // T
            console.log("TIMER EVENT at %s", player.currentTime());
            break;

        case 190: // >
            player.playbackRate(player.playbackRate() * 1.5);
            break;

        case 188: // <
            player.playbackRate(player.playbackRate() / 1.5);
            break;

        case 90:  // Z
            player.playbackRate(1.0);
            break;

        case 32:
            player.paused() ? player.play() : player.pause();
            break;

        case 39:
            player.currentTime(player.currentTime() + 5);

        case 37:
            player.currentTime(player.currentTime() - 5);

        }
    }

    function setupFileReader() {
        $(document)
            .bind("dragover", function(e) { e.preventDefault(); })
            .bind("dragenter", function(e) { e.preventDefault(); })
            .bind("drop", divDrop);

        $("input").keydown(function(e) { e.stopPropagation(); });
        $("html").keydown(readKey);
    }
}();
