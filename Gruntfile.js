module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    eslint: {
      dist: {
        files: [{
          expand: true,
          cwd: './',
          src: ['server.js']
        }]
      }
    }
  });

  grunt.loadNpmTasks('grunt-eslint');
};
