/**
 * @ngdoc service
 * @name just.service.service:userService
 * @description
 * # userService
 * Service to handle users.
 */
angular.module('just.service')
    .service('userService', ['justFlowService', 'authService', 'i18nService', 'justRoutes', 'Resources',
        'localStorageService', '$q', '$location', '$filter', '$rootScope', 'httpPostFactory', 'settings',
        function (flow, authService, i18nService, routes, Resources, storage, $q, $location, $filter, $rootScope, httpPostFactory, settings) {
            var that = this;

            this.signinModel = {};
            this.signinMessage = {};
            this.isCompanyRegister = -1;
            this.isCompany = -1;
            this.user = undefined;
            this.apply_job_id = 0;
            this.message = {};

            this.signin = function (attributes, completeCb) {
                authService.login({data: {attributes: attributes}})
                    .then(function (ok) {

                        $rootScope.$broadcast('onSigninSetmenu');

                        if (angular.isFunction(completeCb)) {
                            completeCb();
                        }
                        if (that.isCompanyRegister === 1) {
                            // Go to job new if register user from company register page
                            that.isCompanyRegister = -1;
                            flow.completed(routes.job.create.url, ok);
                        } else if (that.isCompanyRegister === 0) {
                            that.isCompanyRegister = -1;
                            if (that.apply_job_id === 0) {
                                flow.next(routes.user.user.url, {type: 'arriver_user_register'});
                            } else {
                                flow.next(routes.user.user.url, {type: 'apply_job', job_id: that.apply_job_id});
                            }
                        } else {
                            flow.completed(routes.global.start.url);
                        }
                        that.apply_job = 0;
                    }, function (error) {
                        that.signinMessage = error;
                        flow.reload(routes.user.signin.url);
                    });
            };

            this.registerModel = {};
            this.registerMessage = {};

            this.register = function (attributes, formData) {
                if (formData) {
                    httpPostFactory(settings.just_match_api + settings.just_match_api_version + 'users/images', formData, function (callback) {
                        var image_token = {};
                        image_token.data = {};
                        image_token.data.attributes = {};
                        image_token.data.attributes["user-image-one-time-token"] = callback.data.attributes["one-time-token"];
                        attributes["user-image-one-time-token"] = image_token.data.attributes["user-image-one-time-token"];
                        that.registerConfirm(attributes);
                    });
                } else {
                    that.registerConfirm(attributes);
                }
            };

            this.registerConfirm = function (attributes) {

                attributes.language_id = parseInt(i18nService.getLanguage().$$state.value.id);
                attributes.language_ids = [parseInt(i18nService.getLanguage().$$state.value.id)];

                that.registerModel = attributes;

                var user = Resources.user.create({data: {attributes: attributes}}, function () {
                    /*
                     flow.push(function () {
                     flow.completed(routes.user.created.url, user);
                     });
                     */
                    if (attributes.company_id) {
                        that.isCompanyRegister = 1;
                    } else {
                        that.isCompanyRegister = 0;
                    }
                    that.signin(attributes);
                }, function (error) {
                    that.registerMessage = error;
                    flow.reload(routes.user.register.url);
                });
            };

            this.companyId = function () {
                return storage.get("company_id");
            };

            this.userModel = function () {
                if (authService.isAuthenticated()) {
                    that.getUserDetail();
                }
                return that.user;
            };

            this.getUserDetail = function () {
                if (angular.isUndefined(that.user)) {
                    that.user = Resources.user.get({
                        id: authService.userId().id,
                        "include": "company,language,languages,user-images"
                    }, function (res) {
                        if (that.user.data.relationships.company.data !== null) {
                            var found = $filter('filter')(that.user.included, {
                                id: "" + that.user.data.relationships.company.data.id,
                                type: "companies"
                            }, true);
                            if (found.length > 0) {
                                //that.user.data.attributes["company-name"] = found[0].attributes.name;
                                that.user.data.company = found[0].attributes;
                                Resources.companies.get({
                                    "include": "company-images",
                                    "filter[cin]": found[0].attributes.cin
                                }, function (result_company) {
                                    if (result_company.data[0].relationships["company-images"].data.length > 0) {
                                        var found_company_image = $filter('filter')(result_company.included, {
                                            type: "company-images",
                                            id: "" + result_company.data[0].relationships["company-images"].data[0].id
                                        }, true);
                                        if (found_company_image.length > 0) {
                                            that.user.data.company.company_image = found_company_image[0];
                                        }
                                    } else {
                                        that.user.data.company.company_image = {attributes: {'image-url-small': "assets/images/content/placeholder-logo.png"}};
                                    }
                                });
                            }
                            that.isCompany = 1;
                            storage.set("company_id", that.user.data.relationships.company.data.id);


                        } else {
                            that.isCompany = 0;
                            storage.set("company_id", null);
                        }
                        that.user.data.user_image = 'assets/images/content/placeholder-profile-image.png';
                        if (that.user.data.relationships["user-images"].data.length > 0) {
                            var found_img = $filter('filter')(that.user.included, {
                                type: that.user.data.relationships["user-images"].data[0].type
                            }, true);
                            if (found_img.length > 0) {
                                that.user.data.user_image = found_img[0].attributes["image-url-small"];
                            }
                        }
                    });
                }
            };

            this.clearUserModel = function () {
                that.user = undefined;
                storage.set("company_id", null);
            };

            this.needSignin = function () {
                if (!authService.isAuthenticated()) {
                    var path = $location.path();
                    flow.redirect(routes.user.select.url, function () {
                        flow.redirect(path);
                    });
                }
            };

            this.saveUserModel = function (data, fn) {
                Resources.user.save({id: that.user.data.id}, data, function (response) {
                    that.clearUserModel();
                    that.getUserDetail();
                    if (fn) {
                        fn(1, response);
                    }
                }, function (response) {
                    if (fn) {
                        fn(0, response);
                    }
                });
            };

            this.checkArriverUser = function (warningText, warningLabel, warningUrl) {
                if (!authService.isAuthenticated()) {
                    var path = $location.path();
                    flow.redirect(routes.user.select.url, function () {
                        flow.redirect(path);
                    });
                } else {
                    var warning = {
                        text: warningText,
                        redirect: {
                            title: warningLabel,
                            url: warningUrl
                        }
                    };

                    that.user = that.userModel();

                    if (that.user.$promise) {
                        that.user.$promise.then(function (response) {
                            var deferd = $q.defer();
                            if (that.companyId() !== null) {
                                flow.completed(routes.global.warning.url, warning);
                            }
                            return deferd.promise;
                        });
                    } else {
                        if (that.companyId() !== null) {
                            flow.completed(routes.global.warning.url, warning);
                        }
                    }
                }
            };

            this.checkCompanyUser = function (warningText, warningLabel, warningUrl) {
                if (!authService.isAuthenticated()) {
                    var path = $location.path();
                    flow.replace(routes.user.selectCompany.url, function () {
                        flow.redirect(path);
                    });
                } else {
                    var warning = {
                        text: warningText,
                        redirect: {
                            title: warningLabel,
                            url: warningUrl
                        }
                    };

                    that.user = that.userModel();

                    if (that.user.$promise) {
                        that.user.$promise.then(function (response) {
                            var deferd = $q.defer();
                            if (that.companyId() === null) {
                                flow.replace(routes.global.warning.url, warning);
                            }
                            return deferd.promise;
                        });
                    } else {
                        if (that.companyId() === null) {
                            flow.replace(routes.global.warning.url, warning);
                        }
                    }
                }
            };

            this.reset_password = function (email, fn) {
                var data = {data: {attributes: {email: email}}};
                Resources.userResetPassword.create({}, data, function (response) {
                    if (fn) {
                        fn(1, response);
                    }
                }, function (response) {
                    if (fn) {
                        fn(0, response);
                    }
                });
            };

            this.userMessage = {};

        }]);
