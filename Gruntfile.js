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
        }],
        options: {
          cache: true,
          fix: true,
        },
      }
    }
  });

  grunt.loadNpmTasks('grunt-eslint');
};
